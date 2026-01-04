"use client";

import { cn } from "@/lib/utils";

interface CubeLoaderProps {
  className?: string;
  /** Color variant - defaults to brand purple */
  variant?: "purple" | "cyan";
  /** Size variant */
  size?: "default" | "small";
}

/**
 * Animated cube loader with rolling animation.
 * Based on: https://codepen.io/bealivefr/pen/VwKrbYg
 *
 * Adapted to MegaCampusAI brand colors.
 */
export function CubeLoader({
  className,
  variant = "purple",
  size = "default"
}: CubeLoaderProps) {
  const cubeSize = size === "small" ? 100 : 200;
  const translateX = size === "small" ? -100 : -200;

  // Brand colors
  const colors = {
    purple: {
      bg: "rgb(139 92 246)", // #8b5cf6
      shadow: "rgba(139, 92, 246, 1)",
    },
    cyan: {
      bg: "rgb(6 182 212)", // #06b6d4
      shadow: "rgba(6, 182, 212, 1)",
    },
  };

  const color = colors[variant];

  return (
    <div className={cn("cube-loader-container", className)}>
      <div className="cube-loader-box">
        <div
          className="cube-loader-cube"
          style={{
            width: cubeSize,
            height: cubeSize,
            background: color.bg,
            boxShadow: `
              0 0 5px ${color.shadow},
              0 0 25px ${color.shadow},
              0 0 50px ${color.shadow},
              0 0 150px ${color.shadow}
            `,
          }}
        />
      </div>

      <style jsx>{`
        .cube-loader-container {
          position: relative;
          width: 100%;
          transform: rotate(-35deg);
        }

        .cube-loader-box {
          position: relative;
          left: ${translateX / 2}px;
          display: flex;
          justify-content: center;
          align-items: center;
          width: calc(100% + ${Math.abs(translateX) * 2}px);
          -webkit-box-reflect: below 1px linear-gradient(transparent, rgba(0, 0, 0, 0.3));
          animation: cube-surface 1.5s ease-in-out infinite;
        }

        @keyframes cube-surface {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(${translateX}px);
          }
        }

        .cube-loader-cube {
          position: relative;
          transform-origin: bottom right;
          animation: cube-rotate 1.5s ease-in-out infinite;
        }

        @keyframes cube-rotate {
          0% {
            transform: rotate(0deg);
          }
          60%, 70%, 80%, 100% {
            transform: rotate(90deg);
          }
          65% {
            transform: rotate(85deg);
          }
          75% {
            transform: rotate(87.5deg);
          }
        }
      `}</style>
    </div>
  );
}
