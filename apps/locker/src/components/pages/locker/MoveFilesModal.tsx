import { FlexWrapper } from '@/components/Container';
import DialogBoxV2 from '@/components/DialogBoxV2';
import { Collection } from '@/interfaces/collection';
import { Box, Button, TextField, Typography } from '@mui/material';
import { Fragment, useContext, useEffect, useState } from 'react';
import EnteButton from '@/components/EnteButton';
import { LockerDashboardContext } from '@/pages/locker';
import {
    moveToCollection,
    restoreToCollection,
} from '@/services/collectionService';
import { t } from 'i18next';
import FolderIcon from '@mui/icons-material/Folder';
import { EnteFile } from '@/interfaces/file';
import { useTheme } from '@mui/material';

interface IProps {
    show: boolean;
    collections: Collection[];
    onHide: () => void;
}
const MoveFilesModal = (props: IProps) => {
    const [targetCollection, setTargetCollection] = useState<Collection | null>(
        null
    );

    const { selectedExplorerItems, dashboardView } = useContext(
        LockerDashboardContext
    );

    const [filteredCollections, setFilteredCollections] = useState<
        Collection[]
    >([]);

    const [searchTerm, setSearchTerm] = useState('');

    const theme = useTheme();

    useEffect(() => {
        if (searchTerm.length === 0) {
            setFilteredCollections(props.collections);
            return;
        }

        setFilteredCollections(
            props.collections.filter((collection) =>
                collection.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [searchTerm, props.collections]);

    return (
        <>
            <DialogBoxV2
                sx={{ zIndex: 1600 }}
                open={props.show}
                onClose={props.onHide}
                attributes={{
                    title: `${t('MOVE')} ${selectedExplorerItems.length} ${
                        selectedExplorerItems.length > 1
                            ? t('FILES')
                            : t('UPLOAD_FILES')
                    }`,
                }}>
                <TextField
                    sx={{ width: '100%' }}
                    label="Collection name"
                    variant="outlined"
                    placeholder="Collection name"
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                    }}
                />
                <FlexWrapper flexDirection="column" width="100%" gap=".5rem">
                    {selectedExplorerItems.length > 0 && (
                        <>
                            {filteredCollections.map((collection) => {
                                return (
                                    <Fragment key={collection.id}>
                                        {(dashboardView === 'trash' ||
                                            collection.id !==
                                                (
                                                    selectedExplorerItems[0]
                                                        .originalItem as EnteFile
                                                ).collectionID) && (
                                            <Box
                                                width="100%"
                                                height="3rem"
                                                borderRadius="10px"
                                                padding="1rem"
                                                boxSizing={'border-box'}
                                                display="flex"
                                                alignItems="center"
                                                gap=".5rem"
                                                onClick={() => {
                                                    setTargetCollection(
                                                        collection
                                                    );
                                                }}
                                                border="1px solid white"
                                                sx={{
                                                    cursor: 'pointer',
                                                    backgroundColor:
                                                        targetCollection?.id ===
                                                        collection?.id
                                                            ? theme.colors
                                                                  .accent.A500
                                                            : 'inherit',
                                                    userSelect: 'none',
                                                }}>
                                                <FolderIcon />

                                                <Typography
                                                    textOverflow="ellipsis"
                                                    overflow="hidden"
                                                    whiteSpace="nowrap">
                                                    {collection.name}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </>
                    )}
                </FlexWrapper>
                {targetCollection && (
                    <EnteButton
                        type="submit"
                        size="large"
                        color={'accent'}
                        onClick={async () => {
                            for (const item of selectedExplorerItems) {
                                const file = item.originalItem as EnteFile;
                                if (dashboardView === 'trash') {
                                    await restoreToCollection(
                                        targetCollection,
                                        [file]
                                    );
                                } else {
                                    await moveToCollection(
                                        targetCollection,
                                        file.collectionID,
                                        [file]
                                    );
                                }
                            }
                            props.onHide();
                        }}>
                        {t('MOVE')}
                    </EnteButton>
                )}
                <Button size="large" color="secondary" onClick={props.onHide}>
                    {t('CANCEL')}
                </Button>
            </DialogBoxV2>
        </>
    );
};

export default MoveFilesModal;