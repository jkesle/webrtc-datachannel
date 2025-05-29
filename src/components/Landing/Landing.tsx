import { useCallback, useRef } from 'react';
import { Canvas, useFrame,  } from '@react-three/fiber';
import useWebRTC from '../../hooks/useWebRTC';
import * as THREE from 'three';

export default function HomePage() {
  const remotePosRef = useRef<[number, number, number]>([0, 0, 0]);

  const handleData = useCallback((buffer: ArrayBuffer) => {
    const data = new Float32Array(buffer);
    remotePosRef.current = [data[0], data[1], data[2]];
  }, []);

  const { waiting, paired, sendBytes } = useWebRTC(
    handleData,
    "wss://localhost/ws"
  );


  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <header style={{ position: 'absolute', top: 10, left: 10, zIndex: 1, color: '#fff' }}>
        {waiting && <p>🔄 Waiting for peer...</p>}
        {paired && <p>✅ Connected! Cube sync: constant spin + random jumps.</p>}
        {!waiting && !paired && <p>📡 Connecting…</p>}
      </header>

      <Canvas>
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <SyncCube paired={paired} send={sendBytes} remotePosRef={remotePosRef} />
      </Canvas>
    </div>
  );
}

interface SyncCubeProps {
  paired: boolean;
  send: (buffer: ArrayBuffer) => void;
  remotePosRef: React.MutableRefObject<[number, number, number]>;
}

function SyncCube({ paired, send, remotePosRef }: SyncCubeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const nextJump = useRef(0);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta;
    const [rx, ry, rz] = remotePosRef.current;
    mesh.position.set(rx, ry, rz);

    if (paired) {
      const t = clock.getElapsedTime();
      if (t >= nextJump.current) {
        const nx = (Math.random() - 0.5) * 2;
        const ny = (Math.random() - 0.5) * 2;
        const nz = (Math.random() - 0.5) * 2;
        mesh.position.set(nx, ny, nz);
        const buf = new Float32Array([nx, ny, nz]).buffer;
        send(buf);
        nextJump.current = t + 2;
      }
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="orange" />
    </mesh>
  );
}