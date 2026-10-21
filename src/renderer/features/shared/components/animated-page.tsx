import type { ReactNode, Ref } from 'react';

import { motion } from 'motion/react';
import { forwardRef } from 'react';

import styles from './animated-page.module.css';

import { useAnimationsEnabled } from '/@/renderer/hooks';

interface AnimatedPageProps {
    children: ReactNode;
}

export const AnimatedPage = forwardRef(
    ({ children }: AnimatedPageProps, ref: Ref<HTMLDivElement>) => {
        const animationsEnabled = useAnimationsEnabled();

        return (
            <motion.main
                animate={{ opacity: 1, y: 0 }}
                className={styles.animatedPage}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0, y: 8 }}
                ref={ref}
                transition={
                    animationsEnabled
                        ? { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
                        : { duration: 0 }
                }
            >
                {children}
            </motion.main>
        );
    },
);
