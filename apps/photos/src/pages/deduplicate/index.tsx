import { t } from 'i18next';

import PhotoFrame from 'components/PhotoFrame';
import { ALL_SECTION } from 'constants/collection';
import { AppContext } from 'pages/_app';
import { createContext, useContext, useEffect, useState } from 'react';
import {
    getDuplicateFiles,
    clubDuplicatesByTime,
} from 'services/deduplicationService';
import { syncFiles, trashFiles } from 'services/fileService';
import { EnteFile } from 'types/file';
import { SelectedState } from 'types/gallery';

import { ApiError } from 'utils/error';
import { constructFileToCollectionMap, getSelectedFiles } from 'utils/file';
import {
    DeduplicateContextType,
    DefaultDeduplicateContext,
} from 'types/deduplicate';
import Router from 'next/router';
import DeduplicateOptions from 'components/pages/dedupe/SelectedFileOptions';
import { PHOTOS_PAGES as PAGES } from '@ente/shared/constants/pages';
import router from 'next/router';
import { getKey, SESSION_KEYS } from 'utils/storage/sessionStorage';
import { styled } from '@mui/material';
import { getLatestCollections } from 'services/collectionService';
import EnteSpinner from '@ente/shared/components/EnteSpinner';
import { VerticallyCentered } from 'components/Container';
import Typography from '@mui/material/Typography';
import useMemoSingleThreaded from '@ente/shared/hooks/useMemoSingleThreaded';
import InMemoryStore, { MS_KEYS } from 'services/InMemoryStore';
import { HttpStatusCode } from 'axios';

export const DeduplicateContext = createContext<DeduplicateContextType>(
    DefaultDeduplicateContext
);
export const Info = styled('div')`
    padding: 24px;
    font-size: 18px;
`;

export default function Deduplicate() {
    const { setDialogMessage, startLoading, finishLoading, showNavBar } =
        useContext(AppContext);
    const [duplicateFiles, setDuplicateFiles] = useState<EnteFile[]>(null);
    const [clubSameTimeFilesOnly, setClubSameTimeFilesOnly] = useState(false);
    const [fileSizeMap, setFileSizeMap] = useState(new Map<number, number>());
    const [collectionNameMap, setCollectionNameMap] = useState(
        new Map<number, string>()
    );
    const [selected, setSelected] = useState<SelectedState>({
        count: 0,
        collectionID: 0,
        ownCount: 0,
    });
    const closeDeduplication = function () {
        Router.push(PAGES.GALLERY);
    };
    useEffect(() => {
        const key = getKey(SESSION_KEYS.ENCRYPTION_KEY);
        if (!key) {
            InMemoryStore.set(MS_KEYS.REDIRECT_URL, PAGES.DEDUPLICATE);
            router.push(PAGES.ROOT);
            return;
        }
        showNavBar(true);
    }, []);

    useEffect(() => {
        syncWithRemote();
    }, [clubSameTimeFilesOnly]);

    const fileToCollectionsMap = useMemoSingleThreaded(() => {
        return constructFileToCollectionMap(duplicateFiles);
    }, [duplicateFiles]);

    const syncWithRemote = async () => {
        startLoading();
        const collections = await getLatestCollections();
        const collectionNameMap = new Map<number, string>();
        for (const collection of collections) {
            collectionNameMap.set(collection.id, collection.name);
        }
        setCollectionNameMap(collectionNameMap);
        const files = await syncFiles('normal', collections, () => null);
        let duplicates = await getDuplicateFiles(files, collectionNameMap);
        if (clubSameTimeFilesOnly) {
            duplicates = clubDuplicatesByTime(duplicates);
        }
        const currFileSizeMap = new Map<number, number>();
        let allDuplicateFiles: EnteFile[] = [];
        let toSelectFileIDs: number[] = [];
        let count = 0;
        for (const dupe of duplicates) {
            allDuplicateFiles = [...allDuplicateFiles, ...dupe.files];
            // select all except first file
            toSelectFileIDs = [
                ...toSelectFileIDs,
                ...dupe.files.slice(1).map((f) => f.id),
            ];
            count += dupe.files.length - 1;

            for (const file of dupe.files) {
                currFileSizeMap.set(file.id, dupe.size);
            }
        }
        setDuplicateFiles(allDuplicateFiles);
        setFileSizeMap(currFileSizeMap);
        const selectedFiles = {
            count: count,
            ownCount: count,
            collectionID: ALL_SECTION,
        };
        for (const fileID of toSelectFileIDs) {
            selectedFiles[fileID] = true;
        }
        setSelected(selectedFiles);
        finishLoading();
    };

    const deleteFileHelper = async () => {
        try {
            startLoading();
            const selectedFiles = getSelectedFiles(selected, duplicateFiles);
            await trashFiles(selectedFiles);
        } catch (e) {
            if (
                e instanceof ApiError &&
                e.httpStatusCode === HttpStatusCode.Forbidden
            ) {
                setDialogMessage({
                    title: t('ERROR'),

                    close: { variant: 'critical' },
                    content: t('NOT_FILE_OWNER'),
                });
            } else {
                setDialogMessage({
                    title: t('ERROR'),

                    close: { variant: 'critical' },
                    content: t('UNKNOWN_ERROR'),
                });
            }
        } finally {
            await syncWithRemote();
            finishLoading();
        }
    };

    const clearSelection = function () {
        setSelected({ count: 0, collectionID: 0, ownCount: 0 });
    };

    if (!duplicateFiles) {
        return (
            <VerticallyCentered>
                <EnteSpinner />
            </VerticallyCentered>
        );
    }

    return (
        <DeduplicateContext.Provider
            value={{
                ...DefaultDeduplicateContext,
                collectionNameMap,
                clubSameTimeFilesOnly,
                setClubSameTimeFilesOnly,
                fileSizeMap,
                isOnDeduplicatePage: true,
            }}>
            {duplicateFiles.length > 0 && (
                <Info>
                    {t('DEDUPLICATE_BASED_ON', {
                        context: clubSameTimeFilesOnly
                            ? 'SIZE_AND_CAPTURE_TIME'
                            : 'SIZE',
                    })}
                </Info>
            )}
            {duplicateFiles.length === 0 ? (
                <VerticallyCentered>
                    <Typography variant="large" color="text.muted">
                        {t('NO_DUPLICATES_FOUND')}
                    </Typography>
                </VerticallyCentered>
            ) : (
                <PhotoFrame
                    files={duplicateFiles}
                    syncWithRemote={syncWithRemote}
                    setSelected={setSelected}
                    selected={selected}
                    activeCollectionID={ALL_SECTION}
                    fileToCollectionsMap={fileToCollectionsMap}
                    collectionNameMap={collectionNameMap}
                />
            )}
            <DeduplicateOptions
                deleteFileHelper={deleteFileHelper}
                count={selected.count}
                close={closeDeduplication}
                clearSelection={clearSelection}
            />
        </DeduplicateContext.Provider>
    );
}
