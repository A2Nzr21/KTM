import { generateColors } from '@mantine/colors-generator';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import styles from './library-background-overlay.module.css';

import { useAppThemeColors } from '/@/renderer/themes/use-app-theme';

interface LibraryBackgroundOverlayProps {
    backgroundColor?: string;
    headerRef: React.RefObject<HTMLDivElement | null>;
    opacity?: number;
}

export const LibraryBackgroundOverlay = ({
    backgroundColor,
    headerRef,
    opacity = 0.7,
}: LibraryBackgroundOverlayProps) => {
    const height = useHeaderHeight(headerRef);

    return (
        <div
            className={styles.overlay}
            style={{
                backgroundColor,
                height: height ? `${height + 64}px` : undefined,
                opacity,
            }}
        />
    );
};

const FALLBACK_BACKGROUND = '#0c0c0c';

const resolveBackground = (themeBackground: string, backgroundColor?: string): string => {
    if (backgroundColor && !backgroundColor.startsWith('var(')) {
        return backgroundColor;
    }

    if (!themeBackground.startsWith('var(')) {
        return themeBackground;
    }

    try {
        return (
            getComputedStyle(document.documentElement)
                .getPropertyValue('--theme-colors-background')
                .trim() || FALLBACK_BACKGROUND
        );
    } catch {
        return FALLBACK_BACKGROUND;
    }
};

interface BackgroundOverlayProps {
    backgroundColor?: string;
    direction?: string;
    height?: number | string;
    opacity?: number;
}

export const BackgroundOverlay = ({
    backgroundColor,
    direction = 'to bottom',
    height = '100%',
    opacity,
}: BackgroundOverlayProps) => {
    const theme = useAppThemeColors();

    const colors = generateColors(
        resolveBackground(theme.color['--theme-colors-background'], backgroundColor),
    );

    return (
        <div
            className={clsx(styles.backgroundOverlay)}
            style={
                {
                    '--color-from': colors[6],
                    '--color-to': colors[9],
                    '--direction-and-possibly-color-interpolation': direction,
                    '--dither': 'none',
                    backgroundColor: backgroundColor,
                    height,
                    opacity,
                } as React.CSSProperties
            }
        />
    );
};

interface LibraryBackgroundProps {
    blur?: number;
    headerRef: React.RefObject<HTMLDivElement | null>;
    imageUrl: null | string;
}

export const LibraryBackgroundImage = ({ blur, headerRef, imageUrl }: LibraryBackgroundProps) => {
    const url = imageUrl ? `url(${imageUrl})` : undefined;
    const height = useHeaderHeight(headerRef);
    return (
        <div className={styles.backgroundImageStack}>
            <div
                className={styles.backgroundImage}
                style={{
                    background: url,
                    filter: `blur(${blur ?? 0}rem)`,
                    height: height ? `${height - 64}px` : undefined,
                }}
            />
            <div
                className={styles.backgroundImageOverlay}
                style={{
                    height: height ? `${height + 64}px` : undefined,
                }}
            />
        </div>
    );
};

const useHeaderHeight = (headerRef: React.RefObject<HTMLDivElement | null>) => {
    const [headerHeight, setHeaderHeight] = useState<number>(0);

    useEffect(() => {
        if (!headerRef?.current) return;

        const updateHeight = () => {
            if (headerRef?.current) {
                setHeaderHeight(headerRef.current.offsetHeight);
            }
        };

        updateHeight();

        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(headerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, [headerRef]);

    return headerHeight;
};
