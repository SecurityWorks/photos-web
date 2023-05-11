import React from 'react';
import { SpaceBetweenFlex } from 'components/Container';
import { User } from 'types/user';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import OverflowMenu from 'components/OverflowMenu/menu';

import NotInterestedIcon from '@mui/icons-material/NotInterested';
import { OverflowMenuOption } from 'components/OverflowMenu/option';
import { t } from 'i18next';

interface IProps {
    sharee: User;
    collectionUnshare: (sharee: User) => void;
}
const ShareeRow = ({ sharee, collectionUnshare }: IProps) => {
    const handleClick = () => collectionUnshare(sharee);
    return (
        <SpaceBetweenFlex>
            {sharee.email}
            <OverflowMenu
                menuPaperProps={{
                    sx: {
                        backgroundColor: (theme) =>
                            theme.colors.background.elevated2,
                    },
                }}
                ariaControls={`email-share-${sharee.email}`}
                triggerButtonIcon={<MoreHorizIcon />}>
                <OverflowMenuOption
                    color="critical"
                    onClick={handleClick}
                    startIcon={<NotInterestedIcon />}>
                    {t('REMOVE')}
                </OverflowMenuOption>
            </OverflowMenu>
        </SpaceBetweenFlex>
    );
};

export default ShareeRow;
