import clsx from 'clsx';
import { forwardRef, Ref } from 'react';

import styles from './right-sidebar.module.css';

import {
    SidebarPlayQueue,
    useSidebarPanels,
} from '/@/renderer/features/now-playing/components/sidebar-play-queue';
import { ResizeHandle } from '/@/renderer/features/shared/components/resize-handle';
import { useAppStore, useSideQueueLayout, useSideQueueType } from '/@/renderer/store';

interface RightSidebarProps {
    isResizing: boolean;
    startResizing: (direction: 'left' | 'right' | 'top', mouseEvent?: MouseEvent) => void;
}

export const RightSidebar = forwardRef(
    (
        { isResizing: isResizingRight, startResizing }: RightSidebarProps,
        ref: Ref<HTMLDivElement>,
    ) => {
        const rightExpanded = useAppStore((state) => state.sidebar.rightExpanded);
        const sideQueueType = useSideQueueType();
        const sideQueueLayout = useSideQueueLayout();
        const sidebarPanels = useSidebarPanels();
        const isVerticalLayout = sideQueueLayout === 'vertical';

        const showRightSidebar =
            rightExpanded && sideQueueType === 'sideQueue' && sidebarPanels.length > 0;

        return (
            <>
                {showRightSidebar && (
                    <aside
                        className={clsx(styles.rightSidebarContainer, {
                            [styles.verticalLayout]: isVerticalLayout,
                        })}
                        id="sidebar-queue"
                        key="queue-sidebar"
                    >
                        <ResizeHandle
                            isResizing={isResizingRight}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                startResizing(isVerticalLayout ? 'top' : 'right', e.nativeEvent);
                            }}
                            placement={isVerticalLayout ? 'top' : 'left'}
                            ref={ref}
                        />
                        <SidebarPlayQueue />
                    </aside>
                )}
            </>
        );
    },
);
