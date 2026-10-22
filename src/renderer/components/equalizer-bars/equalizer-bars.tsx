import clsx from 'clsx';

import styles from './equalizer-bars.module.css';

interface EqualizerBarsProps {
    paused?: boolean;
}

export const EqualizerBars = ({ paused }: EqualizerBarsProps) => {
    return (
        <span aria-hidden className={clsx(styles.equalizer, paused && styles.paused)}>
            <span className={styles.bar} />
            <span className={styles.bar} />
            <span className={styles.bar} />
        </span>
    );
};

EqualizerBars.displayName = 'EqualizerBars';
