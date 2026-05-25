"use client";

import React from "react";

type Tool = "pen" | "eraser";

type ToolbarProps = {
  selectedTool: Tool;
  setSelectedTool: (tool: Tool) => void;
};

export default function Toolbar({ selectedTool, setSelectedTool }: ToolbarProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex gap-3 bg-zinc-900 border border-zinc-700 px-4 py-3 rounded-2xl shadow-lg">
      
      <button
        onClick={() => setSelectedTool("pen")}
        className={`px-4 py-2 rounded-xl transition ${
          selectedTool === "pen"
            ? "bg-white text-black"
            : "bg-zinc-800 text-white"
        }`}
      >
        Pen
      </button>

      <button
        onClick={() => setSelectedTool("eraser")}
        className={`px-4 py-2 rounded-xl transition ${
          selectedTool === "eraser"
            ? "bg-white text-black"
            : "bg-zinc-800 text-white"
        }`}
      >
        Eraser
      </button>
    </div>
  );
}