import type { ReactNode, SVGProps } from "react";
import { SHEET } from "../lib/note";
import type { NoteObject, Point } from "../lib/note";
import { arrowHead, normRect, triangleVertices } from "../lib/noteGeometry";

const r1 = (n: number) => Math.round(n * 10) / 10;

export function strokePath(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${r1(x)} ${r1(y)}`).join(" ");
}

type Layer = "images" | "drawing" | "all";

interface Props extends Omit<SVGProps<SVGSVGElement>, "children"> {
  objects: NoteObject[];
  /** `file` -> data: URL of the picture. */
  images: Record<string, string>;
  layer?: Layer;
  children?: ReactNode;
}

function ObjectEl({ o, images }: { o: NoteObject; images: Record<string, string> }) {
  if (o.type === "image") {
    const href = images[o.file];
    return href ? <image href={href} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" /> : null;
  }
  if (o.type === "stroke") {
    if (o.points.length === 1) return <circle cx={o.points[0][0]} cy={o.points[0][1]} r={o.width / 2} fill={o.color} />;
    return <path d={strokePath(o.points)} fill="none" stroke={o.color} strokeWidth={o.width} strokeLinecap="round" strokeLinejoin="round" />;
  }
  const paint = { stroke: o.color, strokeWidth: o.width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const fill = o.fill ? { fill: o.color, fillOpacity: 0.25 } : { fill: "none" };
  switch (o.kind) {
    case "rect": {
      const b = normRect(o.x1, o.y1, o.x2, o.y2);
      return <rect x={b.x} y={b.y} width={b.w} height={b.h} {...paint} {...fill} />;
    }
    case "ellipse": {
      const b = normRect(o.x1, o.y1, o.x2, o.y2);
      return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...paint} {...fill} />;
    }
    case "triangle": {
      const points = triangleVertices(o.x1, o.y1, o.x2, o.y2).map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
      return <polygon points={points} {...paint} {...fill} />;
    }
    case "line":
      return <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...paint} />;
    case "arrow": {
      const [a, b] = arrowHead(o.x1, o.y1, o.x2, o.y2, 8 + o.width * 1.5);
      return (
        <g>
          <line x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...paint} />
          <polyline points={`${r1(a[0])},${r1(a[1])} ${o.x2},${o.y2} ${r1(b[0])},${r1(b[1])}`} fill="none" {...paint} />
        </g>
      );
    }
  }
}

/** Everything drawn on the sheet (pictures and/or drawing). Also used for the thumbnails and the exported image. */
export function NoteSvg({ objects, images, layer = "all", children, ...rest }: Props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SHEET.width} ${SHEET.height}`} width={SHEET.width} height={SHEET.height} {...rest}>
      {objects.map((o, i) => {
        const isImage = o.type === "image";
        if ((layer === "images" && !isImage) || (layer === "drawing" && isImage)) return null;
        return <ObjectEl key={i} o={o} images={images} />;
      })}
      {children}
    </svg>
  );
}
