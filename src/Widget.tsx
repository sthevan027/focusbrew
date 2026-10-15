import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { StateSnapshot } from "./lib/types";
import { fire, getState, onCursorOutside, onOpenNote, onStateChanged, onTogglePanel, openNote, setNoteOverlayOpen, setWidgetExpanded } from "./lib/tauri";
import { scaleFactor } from "./lib/scale";
import { GROW_MS, SHRINK_MS, pickShape } from "./lib/shell";
import type { PanelPhase } from "./lib/shell";
import NoteEditor from "./note/NoteEditor";
import type { NoteRequest } from "./note/NoteEditor";
import Notch from "./widget/Notch";
import Panel from "./widget/Panel";
import { defaultTab, nextTab } from "./widget/mediaTabs";
import { touchesEdge } from "./widget/edgeTouch";
import type { BoxTab } from "./widget/mediaTabs";
import ProgressLine from "./widget/ProgressLine";
import { afterNoteClose, shouldHold } from "./widget/holding";
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
  const phaseRef = useRef<PanelPhase>("closed");
  phaseRef.current = phase;
  const panelBeforeNote = useRef(false);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinned;
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
        hasMedia: Boolean(state.media),
      })
    : null;
  const motion = useMotion(shape?.kind ?? "hidden");

  // Which of the task and the media the box shows: the task by default, Ctrl+Scroll flips it.
  const [tab, setTab] = useState<BoxTab>("task");
  const hasTask = state ? state.timer.status !== "idle" : false;
  const hasMedia = Boolean(state?.media);
  const ready = state !== null;
  const hitRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTab(defaultTab(hasTask, hasMedia));
  }, [hasTask, hasMedia]);
  // The box shows media buttons (the media box, or the task box with the setting on): hovering it must not
  // open the panel over them. Pressing the cursor against the screen edge still does.
  const controlsShown = hasMedia && (tab === "media" || !hasTask || Boolean(state?.config.notch_media_controls));
  useEffect(() => {
    hover.setCanOpen(!controlsShown);
  }, [controlsShown]);
  const mediaBoxShown = controlsShown;
  // Only music playing: the closed box is the medium size whatever the notch style, and rounded.
  const mediaOnlyBox = !hasTask && hasMedia && phase === "closed" && !note.open;
  const onEdgeMove = (e: MouseEvent<HTMLDivElement>) => {
    if (touchesEdge(state?.config.widget_edge ?? "top", e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) {
      hover.openNow();
    }
  };
  useEffect(() => {
    const hit = hitRef.current;
    if (!hit) return;
    // A native listener, not React's onWheel: React's is passive, so it can't cancel the zoom that Ctrl+Scroll does.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setTab((current) => nextTab(current, hasTask, hasMedia, e.deltaY));
    };
    hit.addEventListener("wheel", onWheel, { passive: false });
    return () => hit.removeEventListener("wheel", onWheel);
  }, [hasTask, hasMedia, ready]);

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
      if (!noteOpen.current) panelBeforeNote.current = phaseRef.current !== "closed";
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

  // The backend saw the cursor away from the open panel for a while: close it even if the
  // page never got the mouseleave (a note window taking the focus can swallow it).
  useEffect(() => {
    const unlisten = onCursorOutside(() => {
      // Forget the stale "inside" first, or the next hold change (the list mounting) reopens it.
      cursorLeft.current();
      if (pinnedRef.current || childHold.current || noteOpen.current || phaseRef.current !== "open") return;
      closeNow.current();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Closing the note goes back to what was under it: the panel if it was open,
  // else the box or the bar (then the mouse passes through again).
  const closeNote = () => {
    noteOpen.current = false;
    setNote((n) => ({ ...n, open: false }));
    fire(setNoteOverlayOpen(false));
    if (afterNoteClose({ panelWasOpen: panelBeforeNote.current, pinned }) === "panel") {
      hover.setHolding(shouldHold({ pinned, childHold: childHold.current, noteOpen: false }));
    } else {
      // The note came from the bar or box: go back there, even if the mouse opened the panel meanwhile.
      hover.closeNow();
      fire(setWidgetExpanded(false));
    }
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
  const cursorLeft = useRef(hover.cursorLeft);
  cursorLeft.current = hover.cursorLeft;
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
    "--s": scaleFactor(config.notch_style, mediaOnlyBox),
    "--grow-ms": `${GROW_MS}ms`,
    "--shrink-ms": `${SHRINK_MS}ms`,
  } as CSSProperties;

  return (
    <div className="widget-root" data-edge={config.widget_edge} style={style}>
      <div className="scaled">
        <div
          ref={hitRef}
          className="hit"
          style={{ width: shape.hit.width, height: shape.hit.height }}
          onMouseEnter={hover.onMouseEnter}
          onMouseLeave={hover.onMouseLeave}
          onMouseMove={mediaBoxShown ? onEdgeMove : undefined}
          onClick={phase === "closed" && !note.open ? () => pin(true) : undefined}
        >
          <div
            className={`shell-frame ${shownPhase} ${timer.status} ${motion}`}
            data-round={mediaOnlyBox ? "all" : undefined}
            data-kind={shape.kind}
            style={{ width: shape.shell.width, height: shape.shell.height }}
          >
            <div className={`shell ${shownPhase} ${timer.status}`}>
              {note.open ? (
                <div className="note-root">
                  <NoteEditor request={note.request} placement="overlay" config={config} onClose={closeNote} />
                </div>
              ) : phase === "closed" ? (
                <Notch state={state} now={now} activeTab={tab} />
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
