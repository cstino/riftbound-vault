import type { PointerEvent } from 'react'
import { useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'

/**
 * Inclinazione 3D verso il puntatore e riflesso che lo segue, solo con il mouse e senza
 * "riduci movimento". `max` sono i gradi massimi di rotazione.
 */
export function useTilt(max = 10) {
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const spring = { stiffness: 260, damping: 22 }
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring)
  const rotateX = useSpring(useTransform(py, [0, 1], [max * 0.8, -max * 0.8]), spring)
  const sx = useTransform(px, [0, 1], ['0%', '100%'])
  const sy = useTransform(py, [0, 1], ['0%', '100%'])
  const shine = useMotionTemplate`radial-gradient(circle at ${sx} ${sy}, rgb(255 255 255 / 0.28), transparent 55%)`
  const still = useReducedMotion()
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse' || still) return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width)
    py.set((e.clientY - r.top) / r.height)
  }
  const onPointerLeave = () => {
    px.set(0.5)
    py.set(0.5)
  }
  return { style: { rotateX, rotateY }, shine, handlers: { onPointerMove, onPointerLeave } }
}
