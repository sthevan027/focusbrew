import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StateSnapshot } from "./lib/types";
import { fire, getState, onOpenNote, onStateChanged, onTogglePanel, openNote, setNoteOverlayOpen, setWidgetExpanded } from "./lib/tauri";
import { SCALE_FACTOR } from "./lib/scale";
import { GROW_MS, SHRINK_MS, pickShape } from "./lib/shell";
import type { PanelPhase } from "./lib/shell";
import NoteEditor from "./note/NoteEditor";
import type { NoteRequest } from "./note/NoteEditor";
import Notch from "./widget/Notch";
import Panel from "./widget/Panel";
import ProgressLine from "./widget/ProgressLine";
import { shouldHold } from "./widget/holding";
import { useHoverOpen, useIdleClose, useMotion, useNow } from "./widget/hooks";
import "./Widget.css";

export default function Widget() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [pinned, setPinned] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [note, setNote] = useState<{ open: boolean; request: NoteRequest }>({ open: false, request: { id: null, nonce: 0 } });
  const noteOpen = useRef(false);
  noteOpen.current = note.open;
  const childHold = useRef(false);
  const seq = useRef(0);

  // The window is always panel-sized and never resizes; every change is the
  // shape animating inside it. `setWidgetExpanded` only tells the backend
  // whether the whole window takes the mouse (open) or just the shape.
  const hover = useHoverOpen(
    (open) => {
      const id = ++seq.current;
      fire(setWidgetExpanded(open));
      if (open) {
        setPhase("open");
      } else {
        setPinned(false);
        setPhase("closing");
        window.setTimeout(() => {
          if (seq.current !== id) return;
          setPhase("closed");
          setDay(null); // the next open starts on today
        }, SHRINK_MS);
      }
    },
    90,
    160,
  );
  const now = useNow(state?.timer.status === "running", state?.timer.deadline_ms ?? 0);
  const shape = state
    ? pickShape({
        visible: state.config.widget_visible,
        status: state.timer.status,
        phase,
        edge: state.config.widget_edge,
        sideCount: state.config.side_count_style,
        noteOpen: note.open,
      })
    : null;
  const motion = useMotion(shape?.kind ?? "hidden");

  // Typing, dragging (from the list) or a pin keep the panel open.
  const holdFromList = (hold: boolean) => {
    childHold.current = hold;
    hover.setHolding(shouldHold({ pinned, childHold: hold, noteOpen: noteOpen.current }));
  };
  const pin = (value: boolean) => {
    setPinned(value);
    hover.setHolding(shouldHold({ pinned: value, childHold: childHold.current, noteOpen: noteOpen.current }));
    if (value) hover.openNow();
  };

  useEffect(() => {
    // Inline and in this window only (the settings window shares the bundle):
    // a transparent, margin-less, non-scrolling page behind the notch.
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (!el) continue;
      el.style.background = "transparent";
      el.style.margin = "0";
      el.style.padding = "0";
      el.style.overflow = "hidden";
    }
    getState().then(setState);
    const unlisten = onStateChanged(setState);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // A quick note opens over the panel (or over the bar): the window takes the
  // mouse, and nothing closes the widget until the note is closed.
  useEffect(() => {
    const unlisten = onOpenNote((id) => {
      noteOpen.current = true; // before the list unmounts and lets go of its own hold
      setNote((n) => ({ open: true, request: { id, nonce: n.request.nonce + 1 } }));
      hover.setHolding(true);
      fire(setNoteOverlayOpen(true));
      fire(setWidgetExpanded(true));
    });
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the note goes back to what was under it: the panel if it was open,
  // else the box or the bar (then the mouse passes through again).
  const closeNote = () => {
    noteOpen.current = false;
    setNote((n) => ({ ...n, open: false }));
    fire(setNoteOverlayOpen(false));
    hover.setHolding(shouldHold({ pinned, childHold: childHold.current, noteOpen: false }));
    if (phase === "closed") fire(setWidgetExpanded(false));
  };

  // The panel shortcut opens it pinned, or closes it.
  const togglePanel = useRef(() => {});
  togglePanel.current = () => {
    if (noteOpen.current) return;
    if (phase === "closed") pin(true);
    else hover.closeNow();
  };
  useEffect(() => {
    const unlisten = onTogglePanel(() => togglePanel.current());
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // A pinned panel lets go with Esc or a click anywhere outside the widget
  // (the window loses focus). `hover` is a new object every render, so the
  // listeners reach it through a ref instead of re-subscribing each second.
  const closeNow = useRef(hover.closeNow);
  closeNow.current = hover.closeNow;
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !noteOpen.current) closeNow.current();
    };
    const onBlur = () => {
      if (!noteOpen.current) closeNow.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [pinned]);

  // Optional: a pinned panel nobody touches closes by itself (not while typing or dragging).
  useIdleClose(
    pinned && phase === "open" && !note.open,
    state?.config.panel_autoclose_secs ?? 0,
    () => childHold.current,
    () => closeNow.current(),
  );

  if (!state || !shape || shape.kind === "hidden") return null;

  const { timer, config } = state;
  // Under a note the shape is styled like the open panel, whatever the phase.
  const shownPhase: PanelPhase = note.open ? "open" : phase;
  const style = {
    "--accent": config.accent_color,
    "--s": SCALE_FACTOR[config.widget_scale],
    "--grow-ms": `${GROW_MS}ms`,
    "--shrink-ms": `${SHRINK_MS}ms`,
  } as CSSProperties;

  return (
    <div className="widget-root" data-edge={config.widget_edge} style={style}>
      <div className="scaled">
        <div
          className="hit"
          style={{ width: shape.hit.width, height: shape.hit.height }}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
          onClick={phase === "closed" && !note.open ? () => pin(true) : undefined}
        >
          <div
            className={`shell-frame ${shownPhase} ${timer.status} ${motion}`}
            data-kind={shape.kind}
            style={{ width: shape.shell.width, height: shape.shell.height }}
          >
            <div className={`shell ${shownPhase} ${timer.status}`}>
              {note.open ? (
                <div className="note-root">
                  <NoteEditor request={note.request} placement="overlay" config={config} onClose={closeNote} />
                </div>
              ) : phase === "closed" ? (
                <Notch state={state} now={now} />
              ) : (
                <Panel
                  state={state}
                  now={now}
                  day={day ?? state.today}
                  onDay={setDay}
                  pinned={pinned}
                  onTogglePin={() => pin(!pinned)}
                  onHold={holdFromList}
                  onNote={() => fire(openNote(null))}
                />
              )}
              <ProgressLine
                timer={timer}
                now={now}
                rgb={config.rgb_line}
                visible={config.progress_line && timer.status !== "idle" && !note.open}
                edge={config.widget_edge}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
