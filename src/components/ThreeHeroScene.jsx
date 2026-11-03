import { Component, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(Boolean(media.matches));
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function supportsWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

function SceneShape({ reducedMotion }) {
  const group = useRef(null);
  useFrame((state) => {
    const current = group.current;
    if (!current) return;
    if (reducedMotion) {
      current.rotation.set(0.12, 0.4, 0);
      current.position.y = 0;
      return;
    }
    const time = state.clock.elapsedTime;
    current.rotation.y = time * 0.16;
    current.rotation.x = Math.sin(time * 0.22) * 0.08;
    current.position.y = Math.sin(time * 0.7) * 0.05;
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.18, 1]} />
        <meshBasicMaterial
          color="#a1a1aa"
          wireframe
          transparent
          opacity={0.58}
        />
      </mesh>
      <mesh rotation={[0.35, 0.5, 0.1]}>
        <octahedronGeometry args={[0.52, 0]} />
        <meshStandardMaterial color="#e4e4e7" roughness={0.32} metalness={0.28} />
      </mesh>
      <mesh rotation={[-0.4, 0.2, 0.6]} scale={0.74}>
        <torusGeometry args={[1.42, 0.008, 6, 96]} />
        <meshBasicMaterial color="#71717a" transparent opacity={0.7} />
      </mesh>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.6} />
      <pointLight position={[-2, -1, 2]} intensity={0.7} color="#a1a1aa" />
    </group>
  );
}

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div className="three-hero-fallback" />;
    return this.props.children;
  }
}

/**
 * Decorative, lazy-loaded three.js hero. It is deliberately outside the chat
 * transcript and refuses to mount on devices without WebGL.
 */
export default function ThreeHeroScene() {
  const [webgl, setWebgl] = useState(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setWebgl(supportsWebGL());
  }, []);

  if (webgl === false) return <div className="three-hero-fallback" />;
  if (webgl === null) return <div className="three-hero-scene is-loading" />;

  return (
    <div className="three-hero-scene" aria-hidden="true">
      <SceneBoundary>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 4], fov: 42 }}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
          }}
        >
          <SceneShape reducedMotion={reducedMotion} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
