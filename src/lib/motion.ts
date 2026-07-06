import { Variants } from 'framer-motion'

export const springs = {
  /* Ultra-responsive, mimics mechanical switch or hard tap */
  snappy: { type: 'spring' as const, stiffness: 500, damping: 35, mass: 0.8 },
  /* Standard Apple UI spring: fast acceleration, heavily damped */
  smooth: { type: 'spring' as const, stiffness: 350, damping: 30, mass: 1 },
  /* Used for larger modal or panel transitions */
  gentle: { type: 'spring' as const, stiffness: 200, damping: 25, mass: 1.2 },
}

export const staggers: any = {
  container: { 
    animate: { 
      transition: { staggerChildren: 0.04 } /* Slightly faster stagger for physical cascading */
    } 
  },
  item: { 
    initial: { opacity: 0, y: 12 }, /* Slightly more distance for entrance */
    animate: { 
      opacity: 1, 
      y: 0, 
      transition: springs.smooth 
    } 
  }
}

