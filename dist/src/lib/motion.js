"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staggers = exports.springs = void 0;
exports.springs = {
    /* Ultra-responsive, mimics mechanical switch or hard tap */
    snappy: { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 },
    /* Standard Apple UI spring: fast acceleration, heavily damped */
    smooth: { type: 'spring', stiffness: 350, damping: 30, mass: 1 },
    /* Used for larger modal or panel transitions */
    gentle: { type: 'spring', stiffness: 200, damping: 25, mass: 1.2 },
};
exports.staggers = {
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
            transition: exports.springs.smooth
        }
    }
};
