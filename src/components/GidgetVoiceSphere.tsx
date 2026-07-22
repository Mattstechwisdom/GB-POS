import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Props = {
  active: boolean;
  speaking: boolean;
};

export default function GidgetVoiceSphere({ active, speaking }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 4.2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);
    const geometry = new THREE.IcosahedronGeometry(1.15, 5);
    const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xbc13fe, wireframe: true, transparent: true, opacity: 0.42 });
    const core = new THREE.Mesh(geometry, wireMaterial);
    group.add(core);

    const pointsMaterial = new THREE.PointsMaterial({ color: 0x39ff14, size: 0.018, transparent: true, opacity: 0.82 });
    const points = new THREE.Points(geometry, pointsMaterial);
    points.scale.setScalar(1.018);
    group.add(points);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00d9ff, side: THREE.DoubleSide, transparent: true, opacity: 0.36 });
    const rings = [0, 1, 2].map((index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.52 + index * 0.13, 0.008, 8, 128), ringMaterial.clone());
      ring.rotation.set(index * 0.72, index * 0.84, index * 0.4);
      group.add(ring);
      return ring;
    });

    const glow = new THREE.PointLight(0xbc13fe, 5, 8);
    glow.position.set(0, 0, 2);
    scene.add(glow);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let frame = 0;

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const render = () => {
      const elapsed = clock.getElapsedTime();
      const activity = speaking ? 0.11 : active ? 0.055 : 0.025;
      const pulse = prefersReducedMotion ? 1 : 1 + Math.sin(elapsed * (speaking ? 5.6 : 2.4)) * activity;
      group.scale.setScalar(pulse);
      group.rotation.y = elapsed * 0.2;
      group.rotation.x = Math.sin(elapsed * 0.28) * 0.16;
      rings.forEach((ring, index) => {
        ring.rotation.z += prefersReducedMotion ? 0 : (0.0018 + index * 0.0008) * (speaking ? 2.4 : 1);
        (ring.material as THREE.MeshBasicMaterial).opacity = (speaking ? 0.58 : 0.28) + Math.sin(elapsed * 2 + index) * 0.08;
      });
      wireMaterial.opacity = speaking ? 0.7 : active ? 0.48 : 0.3;
      pointsMaterial.size = speaking ? 0.027 : 0.018;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      wireMaterial.dispose();
      pointsMaterial.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [active, speaking]);

  return <div ref={mountRef} className="gidget-voice-sphere" aria-hidden="true" />;
}
