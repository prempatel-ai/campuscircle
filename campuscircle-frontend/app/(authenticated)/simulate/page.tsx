"use client";

import React from "react";
import Link from "next/link";
import { Cpu, Wind, Rocket, Coins } from "lucide-react";

export default function SimulatePage() {
  const simulations = [
    {
      id: "ChipTycoon",
      title: "ChipTycoon",
      description: "Interactive logic gate and IoT hardware simulator. Build circuits from scratch.",
      icon: <Cpu className="w-8 h-8 text-blue-500" />,
      color: "bg-blue-500/10 border-blue-500/20",
      path: "/simulations/ChipTycoon/index.html"
    },
    {
      id: "engineworks",
      title: "EngineWorks",
      description: "Thermodynamics and internal combustion engine dynamics simulator.",
      icon: <Wind className="w-8 h-8 text-orange-500" />,
      color: "bg-orange-500/10 border-orange-500/20",
      path: "/simulations/engineworks/index.html"
    },
    {
      id: "rocket-engine",
      title: "Rocket Propulsion",
      description: "Orbital mechanics and rocket engine thrust vectoring visualizer.",
      icon: <Rocket className="w-8 h-8 text-red-500" />,
      color: "bg-red-500/10 border-red-500/20",
      path: "/simulations/rocket-engine/index.html"
    },
    {
      id: "token-town",
      title: "Token Town",
      description: "Macroeconomic systems and decentralized tokenomics simulation engine.",
      icon: <Coins className="w-8 h-8 text-yellow-500" />,
      color: "bg-yellow-500/10 border-yellow-500/20",
      path: "/simulations/token-town/index.html"
    }
  ];

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full py-8 px-4 sm:px-6 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink">
            Interactive Simulations
          </h1>
          <span className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-bold font-mono uppercase tracking-wider rounded-full border border-primary/20">
            Beta
          </span>
        </div>
        <p className="font-sans text-sm text-ink/70 max-w-2xl">
          Apply your STEM knowledge in real-time interactive sandboxes. Experiment with physics, logic, and economics safely.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {simulations.map((sim) => (
          <a
            key={sim.id}
            href={sim.path}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col group relative overflow-hidden bg-surface border rounded-2xl p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-1 ${sim.color}`}
          >
            <div className="flex-1 space-y-4">
              <div className="p-3 bg-background/50 rounded-xl w-fit backdrop-blur-sm border border-border-muted/50 group-hover:scale-110 transition-transform duration-300">
                {sim.icon}
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-ink group-hover:text-primary transition-colors">
                  {sim.title}
                </h3>
                <p className="font-sans text-xs text-ink/70 mt-2 leading-relaxed">
                  {sim.description}
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-between border-t border-border-muted/40 pt-4">
              <span className="text-[11px] font-mono font-bold text-ink/50 uppercase">
                Launch Sandbox
              </span>
              <svg 
                className="w-4 h-4 text-ink/40 group-hover:text-primary transition-colors transform group-hover:translate-x-1" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
