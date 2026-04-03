"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { Building2, Users, Zap, Shield } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface District {
  name: string;
  color: string;
  glowColor: string;
  floors: number;
  description: string;
  population?: string;
  power?: string;
  threat?: string;
}

interface Block {
  row: number;
  col: number;
  district: District | null;
}

const districts: Record<string, District> = {
  "Neo Downtown": {
    name: "Neo Downtown",
    color: "#00f0ff",
    glowColor: "rgba(0, 240, 255, 0.6)",
    floors: 5,
    description: "Central business district with towering megastructures",
    population: "2.4M",
    power: "98%",
    threat: "Low",
  },
  "Chrome Heights": {
    name: "Chrome Heights",
    color: "#b829ff",
    glowColor: "rgba(184, 41, 255, 0.5)",
    floors: 4,
    description: "Luxury residential towers for the elite",
    population: "890K",
    power: "95%",
    threat: "Low",
  },
  "Iron Works": {
    name: "Iron Works",
    color: "#ff8c00",
    glowColor: "rgba(255, 140, 0, 0.6)",
    floors: 3,
    description: "Industrial sector with heavy manufacturing",
    population: "450K",
    power: "82%",
    threat: "Medium",
  },
  "Black Zone": {
    name: "Black Zone",
    color: "#1a1a2e",
    glowColor: "rgba(100, 100, 120, 0.3)",
    floors: 2,
    description: "Abandoned sector, minimal power grid",
    population: "12K",
    power: "15%",
    threat: "Critical",
  },
  "Silicon Valley II": {
    name: "Silicon Valley II",
    color: "#00ff88",
    glowColor: "rgba(0, 255, 136, 0.5)",
    floors: 4,
    description: "Tech hub for AI and cybernetics R&D",
    population: "1.1M",
    power: "99%",
    threat: "Low",
  },
  "Green Sector": {
    name: "Green Sector",
    color: "#00ff88",
    glowColor: "rgba(0, 255, 136, 0.4)",
    floors: 2,
    description: "Agricultural dome and recreational zone",
    population: "320K",
    power: "91%",
    threat: "Low",
  },
};

const districtGrid: (string | null)[][] = [
  ["Chrome Heights", "Chrome Heights", "Neo Downtown", "Neo Downtown", "Iron Works", "Iron Works"],
  ["Chrome Heights", "Chrome Heights", "Neo Downtown", "Neo Downtown", "Iron Works", "Iron Works"],
  ["Green Sector", "Green Sector", "Neo Downtown", "Neo Downtown", "Silicon Valley II", "Silicon Valley II"],
  ["Green Sector", "Green Sector", "Neo Downtown", "Neo Downtown", "Silicon Valley II", "Silicon Valley II"],
  ["Black Zone", "Black Zone", "Silicon Valley II", "Silicon Valley II", "Iron Works", "Iron Works"],
  ["Black Zone", "Black Zone", "Silicon Valley II", "Silicon Valley II", "Iron Works", "Iron Works"],
];

export default function CityPreview3D() {
  const { t } = useTranslation();
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<Block | null>(null);

  const blocks = useMemo(() => {
    const result: Block[][] = [];
    for (let row = 0; row < 6; row++) {
      const rowBlocks: Block[] = [];
      for (let col = 0; col < 6; col++) {
        const districtName = districtGrid[row][col];
        rowBlocks.push({
          row,
          col,
          district: districtName ? districts[districtName] : null,
        });
      }
      result.push(rowBlocks);
    }
    return result;
  }, []);

  const getBlockHeight = (district: District | null): number => {
    if (!district) return 1;
    return district.floors;
  };

  const getBlockColor = (district: District | null, isHovered: boolean): string => {
    if (!district) return "#1a1a2e";
    if (isHovered) return district.color;
    return district.color + "99";
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-orbitron font-bold text-cyber-blue cyber-text-glow">
          {t('city3d_title')}
        </h1>
        <p className="text-cyber-text-dim mt-1">
          {t('city3d_desc')}
        </p>
      </motion.div>

      <div className="grid grid-cols-4 gap-4">
        {Object.values(districts).map((district, i) => (
          <motion.div
            key={district.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: district.color,
                  boxShadow: `0 0 10px ${district.glowColor}`,
                }}
              />
              <span className="text-xs font-orbitron text-cyber-text">
                {district.name}
              </span>
            </div>
            <div className="text-lg font-bold" style={{ color: district.color }}>
              {district.floors}F
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-xl p-6 overflow-hidden"
      >
        <h3 className="text-lg font-orbitron text-cyber-text mb-4">
          {t('isometricGrid')}
        </h3>
        <div className="relative h-[500px] flex items-center justify-center">
          <div
            className="relative"
            style={{
              perspective: "1000px",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              className="relative"
              style={{
                transform: "rotateX(55deg) rotateZ(-45deg)",
                transformStyle: "preserve-3d",
              }}
            >
              {blocks.map((row, rowIdx) =>
                row.map((block, colIdx) => {
                  const height = getBlockHeight(block.district);
                  const isHovered =
                    hoveredBlock?.row === rowIdx && hoveredBlock?.col === colIdx;
                  const isSelected =
                    selectedBlock?.row === rowIdx &&
                    selectedBlock?.col === colIdx;
                  const color = getBlockColor(block.district, isHovered);

                  return (
                    <motion.div
                      key={`${rowIdx}-${colIdx}`}
                      className="absolute cursor-pointer"
                      style={{
                        left: colIdx * 60,
                        top: rowIdx * 60,
                        width: 50,
                        height: 50,
                        transformStyle: "preserve-3d",
                      }}
                      onClick={() =>
                        setSelectedBlock(
                          isSelected ? null : { ...block, row: rowIdx, col: colIdx }
                        )
                      }
                      onMouseEnter={() =>
                        setHoveredBlock({ ...block, row: rowIdx, col: colIdx })
                      }
                      onMouseLeave={() => setHoveredBlock(null)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div
                        className="absolute inset-0 border"
                        style={{
                          borderColor: block.district?.color || "#2a2a3e",
                          opacity: 0.6,
                        }}
                      />
                      {[...Array(height)].map((_, floorIdx) => (
                        <motion.div
                          key={floorIdx}
                          className="absolute left-0 right-0"
                          style={{
                            bottom: floorIdx * 18,
                            height: 16,
                            backgroundColor: color,
                            border:
                              floorIdx === height - 1
                                ? `1px solid ${block.district?.color || "#2a2a3e"}`
                                : "none",
                            boxShadow:
                              floorIdx === height - 1 && isHovered
                                ? `0 0 20px ${block.district?.glowColor || "transparent"}, inset 0 0 10px ${block.district?.glowColor || "transparent"}`
                                : `inset 0 0 5px ${block.district?.glowColor || "transparent"}`,
                            transform: "translateZ(0)",
                          }}
                          animate={{
                            boxShadow: isHovered
                              ? [
                                  `0 0 20px ${block.district?.glowColor || "transparent"}`,
                                  `0 0 30px ${block.district?.glowColor || "transparent"}`,
                                  `0 0 20px ${block.district?.glowColor || "transparent"}`,
                                ]
                              : `inset 0 0 5px ${block.district?.glowColor || "transparent"}`,
                          }}
                          transition={{
                            duration: isHovered ? 1.5 : 0.5,
                            repeat: isHovered ? Infinity : 0,
                          }}
                        />
                      ))}
                      <div
                        className="absolute"
                        style={{
                          left: 0,
                          top: -height * 18 - 2,
                          width: 50,
                          height: height * 18,
                          backgroundColor: color,
                          opacity: 0.3,
                          transform: "rotateX(-90deg)",
                          transformOrigin: "bottom",
                        }}
                      />
                      <div
                        className="absolute"
                        style={{
                          right: -height * 18 - 2,
                          top: 0,
                          width: height * 18,
                          height: 50,
                          backgroundColor: color,
                          opacity: 0.2,
                          transform: "rotateY(90deg)",
                          transformOrigin: "left",
                        }}
                      />
                    </motion.div>
                  );
                })
              )}
            </div>

            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.4) 100%)",
                transform: "rotateX(55deg) rotateZ(-45deg) translateZ(-100px)",
              }}
            />
          </div>

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
            }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 justify-center">
          {Object.values(districts).map((district) => (
            <div key={district.name} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: district.color,
                  boxShadow: `0 0 8px ${district.glowColor}`,
                }}
              />
              <span className="text-xs text-cyber-text-dim">{district.name}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedBlock && selectedBlock.district && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-cyber-dark/80 border border-cyber-blue/30 rounded-xl p-6 backdrop-blur-sm"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3
                  className="text-xl font-orbitron font-bold"
                  style={{
                    color: selectedBlock.district.color,
                    textShadow: `0 0 20px ${selectedBlock.district.glowColor}`,
                  }}
                >
                  {selectedBlock.district.name}
                </h3>
                <p className="text-cyber-text-dim text-sm mt-1">
                  {selectedBlock.district.description}
                </p>
              </div>
              <div
                className="px-3 py-1 rounded-full text-xs font-orbitron"
                style={{
                  backgroundColor: `${selectedBlock.district.color}20`,
                  border: `1px solid ${selectedBlock.district.color}`,
                  color: selectedBlock.district.color,
                }}
              >
                Sector {selectedBlock.row + 1}-{selectedBlock.col + 1}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-cyber-darker/50 rounded-lg p-3 border border-cyber-gray/30">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-cyber-purple" />
                  <span className="text-xs text-cyber-text-dim">{t('population')}</span>
                </div>
                <div className="text-lg font-bold text-cyber-text">
                  {selectedBlock.district.population}
                </div>
              </div>

              <div className="bg-cyber-darker/50 rounded-lg p-3 border border-cyber-gray/30">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-cyber-yellow" />
                  <span className="text-xs text-cyber-text-dim">{t('power')}</span>
                </div>
                <div className="text-lg font-bold text-cyber-text">
                  {selectedBlock.district.power}
                </div>
              </div>

              <div className="bg-cyber-darker/50 rounded-lg p-3 border border-cyber-gray/30">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-cyber-blue" />
                  <span className="text-xs text-cyber-text-dim">Height</span>
                </div>
                <div className="text-lg font-bold text-cyber-text">
                  {selectedBlock.district.floors} Floors
                </div>
              </div>

              <div className="bg-cyber-darker/50 rounded-lg p-3 border border-cyber-gray/30">
                <div className="flex items-center gap-2 mb-1">
                  <Shield
                    className={`w-4 h-4 ${
                      selectedBlock.district.threat === "Low"
                        ? "text-cyber-green"
                        : selectedBlock.district.threat === "Medium"
                        ? "text-cyber-orange"
                        : "text-cyber-red"
                    }`}
                  />
                  <span className="text-xs text-cyber-text-dim">Threat</span>
                </div>
                <div
                  className={`text-lg font-bold ${
                    selectedBlock.district.threat === "Low"
                      ? "text-cyber-green"
                      : selectedBlock.district.threat === "Medium"
                      ? "text-cyber-orange"
                      : "text-cyber-red"
                  }`}
                >
                  {selectedBlock.district.threat}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className="flex-1 py-2 bg-cyber-blue/20 border border-cyber-blue/30 rounded text-sm text-cyber-blue hover:bg-cyber-blue/30 transition-colors">
                {t('city3d_title')}
              </button>
              <button className="flex-1 py-2 bg-cyber-purple/20 border border-cyber-purple/30 rounded text-sm text-cyber-purple hover:bg-cyber-purple/30 transition-colors">
                {t('settings')}
              </button>
              <button className="flex-1 py-2 bg-cyber-orange/20 border border-cyber-orange/30 rounded text-sm text-cyber-orange hover:bg-cyber-orange/30 transition-colors">
                {t('emergency')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
