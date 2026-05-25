"use client";

import { useEffect, useRef, useState } from "react";
// `yjs` and `y-websocket` are dynamically imported inside useEffect
import { Stage, Layer, Line } from "react-konva";
import type Konva from "konva";
import Toolbar from "./Toolbar";

type Tool = "pen" | "eraser";

type CanvasLine = {
    id: string;
    points: number[];
    tool: Tool;
};

const WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL ?? "ws://localhost:1234";
type InfiniteCanvasProps = {
    roomId: string;
    className?: string;
};

export default function InfiniteCanvas({ roomId, className }: InfiniteCanvasProps) {
      const [lines, setLines] = useState<CanvasLine[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool>("pen");
  const yLinesRef = useRef<any | null>(null);
  const currentLineIdRef = useRef<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const pinchDistRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    let provider: any = null;
    let doc: any = null;

    (async () => {
      const Y = await import("yjs");
      const ws = await import("y-websocket");

      if (!mounted) return;
      doc = new Y.Doc();
      provider = new ws.WebsocketProvider(WEBSOCKET_URL, roomId, doc);
      const yLines = doc.getArray("lines");

      const syncLines = () => {
        setLines(yLines.toArray());
      };

      yLines.observe(syncLines);
      syncLines();

      yLinesRef.current = yLines;
    })();

    return () => {
      mounted = false;
      try {
        if (yLinesRef.current && yLinesRef.current.unobserve) {
          // remove observers if any
          // no-op: we don't have the syncLines reference here
        }
        if (provider && provider.destroy) provider.destroy();
        if (doc && doc.destroy) doc.destroy();
      } catch (e) {
        // ignore
      }
      yLinesRef.current = null;
      currentLineIdRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const updateCurrentLine = (nextPoint: { x: number; y: number }) => {
    const yLines = yLinesRef.current;
    const currentLineId = currentLineIdRef.current;

    if (!yLines || !currentLineId) return;

    const lineIndex = (yLines.toArray() as CanvasLine[]).findIndex(
      (line: CanvasLine) => line.id === currentLineId,
    );
    if (lineIndex < 0) return;

    const line = yLines.get(lineIndex);
    if (!line) return;

    yLines.delete(lineIndex, 1);
    yLines.insert(lineIndex, [
      {
        ...line,
        points: [...line.points, nextPoint.x, nextPoint.y],
      },
    ]);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const yLines = yLinesRef.current;
    const stage = stageRef.current ?? e.target.getStage();
    if (!yLines || !stage) return;

    setIsDrawing(true);

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert pointer to stage coords that account for scale/position
    const scale = stage.scaleX() || 1;
    const pos = {
      x: (pointer.x - stage.x()) / scale,
      y: (pointer.y - stage.y()) / scale,
    };

    const nextLine: CanvasLine = {
      id: (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Date.now()),
      points: [pos.x, pos.y],
      tool: selectedTool,
    };

    yLines.push([nextLine]);
    currentLineIdRef.current = nextLine.id;
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;

    const stage = stageRef.current ?? e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer || !stage) return;

    const scale = stage.scaleX() || 1;
    const point = { x: (pointer.x - stage.x()) / scale, y: (pointer.y - stage.y()) / scale };

    updateCurrentLine(point);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    currentLineIdRef.current = null;
  };

  const width = typeof window !== "undefined" ? window.innerWidth : 0;
  const height = typeof window !== "undefined" ? window.innerHeight : 0;

  return (
    <div ref={containerRef} className={className ? className : "relative h-full w-full"}>
      <Stage
        ref={(node) => {
          // react-konva gives direct Konva.Stage instance
          stageRef.current = node as unknown as Konva.Stage | null;
        }}
        width={canvasSize.width || width}
        height={canvasSize.height || height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        draggable={!isDrawing}
        onWheel={(e) => {
          const stage = stageRef.current ?? e.target.getStage();
          if (!stage) return;
          e.evt.preventDefault();
          const oldScale = stage.scaleX() || 1;
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const mousePointTo = {
            x: (pointer.x - stage.x()) / oldScale,
            y: (pointer.y - stage.y()) / oldScale,
          };
          const scaleBy = 1.05;
          const direction = e.evt.deltaY > 0 ? 1 : -1;
          const newScale = Math.max(0.2, Math.min(5, oldScale * (direction > 0 ? 1 / scaleBy : scaleBy)));
          stage.scale({ x: newScale, y: newScale });
          const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
          };
          stage.position(newPos);
          stage.batchDraw();
        }}
        onTouchStart={(e) => {
          const touches = (e.evt.touches as TouchList) || [];
          if (touches.length === 2) {
            const p1 = touches[0];
            const p2 = touches[1];
            const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
            pinchDistRef.current = dist;
            lastCenterRef.current = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
          }
        }}
        onTouchMove={(e) => {
          const touches = (e.evt.touches as TouchList) || [];
          const stage = stageRef.current ?? e.target.getStage();
          if (!stage) return;
          if (touches.length === 2 && pinchDistRef.current && lastCenterRef.current) {
            const p1 = touches[0];
            const p2 = touches[1];
            const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
            const center = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
            const oldScale = stage.scaleX() || 1;
            const scaleChange = dist / pinchDistRef.current;
            const newScale = Math.max(0.2, Math.min(5, oldScale * scaleChange));

            // convert center to stage coords
            const pointer = stage.getPointerPosition() || { x: center.x, y: center.y };
            const mousePointTo = {
              x: (pointer.x - stage.x()) / oldScale,
              y: (pointer.y - stage.y()) / oldScale,
            };

            stage.scale({ x: newScale, y: newScale });
            const newPos = {
              x: pointer.x - mousePointTo.x * newScale,
              y: pointer.y - mousePointTo.y * newScale,
            };
            stage.position(newPos);
            stage.batchDraw();

            // update refs for continuous pinch
            pinchDistRef.current = dist;
            lastCenterRef.current = center;
          }
        }}
        onTouchEnd={() => {
          pinchDistRef.current = null;
          lastCenterRef.current = null;
        }}
        style={{ background: "#fff" }}
      >
        <Layer>
          {lines.map((line, i) => (
            <Line
              key={i}
              points={line.points}
              stroke={line.tool === "eraser" ? "#ffffff" : "#000000"}
              strokeWidth={line.tool === "eraser" ? 20 : 3}
              tension={0.5}
              lineCap="round"
            />
          ))}
        </Layer>
      </Stage>

      <Toolbar selectedTool={selectedTool} setSelectedTool={setSelectedTool} />
    </div>
  );
}