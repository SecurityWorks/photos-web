import React, {
    useState,
    useEffect,
    useContext,
    ChangeEvent,
    useRef,
} from 'react';
import { getData, LS_KEYS } from 'utils/storage/localStorage';
import { useRouter } from 'next/router';
import { ComlinkWorker } from 'utils/crypto';
import { AppContext } from 'pages/_app';
import { PAGES } from 'types';
import * as Comlink from 'comlink';
import { runningInBrowser } from 'utils/common';
import TFJSImage from './TFJSImage';
import {
    Face,
    FACE_CROPS_CACHE_NAME,
    MLDebugResult,
    MLSyncConfig,
    Person,
} from 'types/machineLearning';
import Tree from 'react-d3-tree';
import MLFileDebugView from './MLFileDebugView';
import mlWorkManager from 'services/machineLearning/mlWorkManager';
// import { getAllFacesMap, mlLibraryStore } from 'utils/storage/mlStorage';
import { getAllFacesFromMap, getAllPeople } from 'utils/machineLearning';
import { FaceImagesRow, ImageBlobView, ImageCacheView } from './ImageViews';
import mlIDbStorage from 'utils/storage/mlIDbStorage';
import { getFaceCropBlobFromStorage } from 'utils/machineLearning/faceCrop';
import { PeopleList } from './PeopleList';
import styled from 'styled-components';
import { RawNodeDatum } from 'react-d3-tree/lib/types/common';
import { DebugInfo } from 'hdbscan';
import { toD3Tree } from 'utils/machineLearning/clustering';
import {
    getMLSyncConfig,
    getMLSyncJobConfig,
    updateMLSyncConfig,
    updateMLSyncJobConfig,
} from 'utils/machineLearning/config';
import { Col, Row } from 'react-bootstrap';
import { JobConfig } from 'types/common/job';
import { ConfigEditor } from './ConfigEditor';
import {
    DEFAULT_ML_SYNC_CONFIG,
    DEFAULT_ML_SYNC_JOB_CONFIG,
} from 'constants/machineLearning/config';

interface TSNEProps {
    mlResult: MLDebugResult;
}

function TSNEPlot(props: TSNEProps) {
    return (
        <svg
            width={props.mlResult.tsne.width + 40}
            height={props.mlResult.tsne.height + 40}>
            {props.mlResult.tsne.dataset.map((data, i) => (
                <foreignObject
                    key={i}
                    x={data.x - 20}
                    y={data.y - 20}
                    width={40}
                    height={40}>
                    <TFJSImage
                        faceImage={props.mlResult.allFaces[i]?.faceImage}
                        width={40}
                        height={40}></TFJSImage>
                </foreignObject>
            ))}
        </svg>
    );
}

const D3ImageContainer = styled.div`
    & > img {
        width: 100%;
        height: 100%;
    }
`;

const renderForeignObjectNode = ({ nodeDatum, foreignObjectProps }) => (
    <g>
        <circle r={15}></circle>
        {/* `foreignObject` requires width & height to be explicitly set. */}
        <foreignObject {...foreignObjectProps}>
            <div
                style={{
                    border: '1px solid black',
                    backgroundColor: '#dedede',
                }}>
                <h3 style={{ textAlign: 'center', color: 'black' }}>
                    {nodeDatum.name}
                </h3>
                {!nodeDatum.children && nodeDatum.name && (
                    <D3ImageContainer>
                        <ImageCacheView
                            url={nodeDatum.attributes.face.crop?.imageUrl}
                            cacheName={FACE_CROPS_CACHE_NAME}
                        />
                    </D3ImageContainer>
                )}
            </div>
        </foreignObject>
    </g>
);

const readAsDataURL = (blob) =>
    new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsDataURL(blob);
    });

const readAsText = (blob) =>
    new Promise<string>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => resolve(fileReader.result as string);
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsText(blob);
    });

const getFaceCrops = async (faces: Face[]) => {
    const faceCropPromises = faces
        .filter((f) => f?.crop)
        .map((f) => getFaceCropBlobFromStorage(f.crop));
    return Promise.all(faceCropPromises);
};

const ClusterFacesRow = styled(FaceImagesRow)`
    display: flex;
`;

export default function MLDebug() {
    const [token, setToken] = useState<string>();
    const [clusterFaceDistance] = useState<number>(0.4);
    // const [minClusterSize, setMinClusterSize] = useState<number>(5);
    // const [minFaceSize, setMinFaceSize] = useState<number>(32);
    // const [batchSize, setBatchSize] = useState<number>(200);
    const [maxFaceDistance] = useState<number>(0.5);
    const [mlResult, setMlResult] = useState<MLDebugResult>({
        allFaces: [],
        clustersWithNoise: {
            clusters: [],
            noise: [],
        },
        tree: null,
        tsne: null,
    });

    const [allPeople, setAllPeople] = useState<Array<Person>>([]);
    const [clusters, setClusters] = useState<Array<Array<Blob>>>([]);
    const [noiseFaces, setNoiseFaces] = useState<Array<Blob>>([]);
    const [mstD3Tree, setMstD3Tree] = useState<RawNodeDatum>(null);
    const [debugFile, setDebugFile] = useState<File>();
    const importMLDataFileInput = useRef(null);

    const router = useRouter();
    const appContext = useContext(AppContext);

    const getDedicatedMLWorker = (): ComlinkWorker => {
        if (token) {
            console.log('Toen present');
        }
        if (runningInBrowser()) {
            console.log('initiating worker');
            const worker = new Worker(
                new URL('worker/machineLearning.worker', import.meta.url),
                { name: 'ml-worker' }
            );
            console.log('initiated worker');
            const comlink = Comlink.wrap(worker);
            return { comlink, worker };
        }
    };
    let MLWorker: ComlinkWorker;

    useEffect(() => {
        const user = getData(LS_KEYS.USER);
        if (!user?.token) {
            router.push(PAGES.ROOT);
        } else {
            setToken(user.token);
        }
        appContext.showNavBar(true);
    }, []);

    const onSync = async () => {
        try {
            if (!MLWorker) {
                MLWorker = getDedicatedMLWorker();
                console.log('initiated MLWorker');
            }
            const mlWorker = await new MLWorker.comlink();
            const result = await mlWorker.sync(
                token,
                clusterFaceDistance,
                // minClusterSize,
                // minFaceSize,
                // batchSize,
                maxFaceDistance
            );
            setMlResult(result);
        } catch (e) {
            console.error(e);
            throw e;
        } finally {
            // setTimeout(()=>{
            //     console.log('terminating ml-worker');
            MLWorker.worker.terminate();
            // }, 30000);
        }
    };

    let mlWorker;
    const onStartMLSync = async () => {
        if (!MLWorker) {
            MLWorker = getDedicatedMLWorker();
            console.log('initiated MLWorker');
        }
        if (!mlWorker) {
            mlWorker = await new MLWorker.comlink();
        }
        mlWorker.scheduleNextMLSync(token);
    };

    const onStopMLSync = async () => {
        // if (mlWorker) {
        //     mlWorker.cancelNextMLSync();
        // }
        await mlWorkManager.stopSyncJob();
    };

    // for debug purpose, not a memory efficient implementation
    const onExportMLData = async () => {
        const mlDbData = await mlIDbStorage.getAllMLData();
        const faceClusteringResults =
            mlDbData?.library?.data?.faceClusteringResults;
        faceClusteringResults && (faceClusteringResults.debugInfo = undefined);
        console.log(
            'Exporting ML DB data: ',
            Object.keys(mlDbData),
            Object.keys(mlDbData)?.map((k) => Object.keys(mlDbData[k])?.length)
        );

        const faceCropCache = await caches.open(FACE_CROPS_CACHE_NAME);
        const keys = await faceCropCache.keys();
        const faceCrops = {};
        console.log('Exporting faceCrops cache entries: ', keys.length);
        for (let i = 0; i < keys.length; i++) {
            const response = await faceCropCache.match(keys[i]);
            const blob = await response.blob();
            const data = await readAsDataURL(blob);
            const path = new URL(keys[i].url).pathname;
            faceCrops[path] = data;
        }
        const mlCacheData = {};
        mlCacheData[FACE_CROPS_CACHE_NAME] = faceCrops;

        const mlData = { mlDbData, mlCacheData };

        const mlDataJson = JSON.stringify(mlData);
        const mlDataJsonBlob = new Blob([mlDataJson], {
            type: 'application/json',
        });
        const a = document.createElement('a');
        a.download = `ente-mldata-${Date.now()}.json`;
        a.href = window.URL.createObjectURL(mlDataJsonBlob);
        const clickEvt = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        a.dispatchEvent(clickEvt);
        a.remove();
        console.log('ML Data Exported');
    };

    const onImportMLDataClick = () => {
        importMLDataFileInput.current.click();
    };

    const onImportMLData = async (event: ChangeEvent<HTMLInputElement>) => {
        const mlDataJson = await readAsText(event.target.files[0]);
        const mlData = JSON.parse(mlDataJson);
        const { mlDbData, mlCacheData } = mlData;

        const faceCrops = mlCacheData[FACE_CROPS_CACHE_NAME];
        console.log(
            'Importing faceCrops cache entries: ',
            Object.keys(faceCrops).length
        );
        const faceCropCache = await caches.open(FACE_CROPS_CACHE_NAME);
        for (const url of Object.keys(faceCrops)) {
            const data = await fetch(faceCrops[url]);
            faceCropCache.put(url, data);
        }

        console.log(
            'Importing ML DB data: ',
            Object.keys(mlDbData),
            Object.keys(mlDbData)?.map((k) => Object.keys(mlDbData[k])?.length)
        );
        await mlIDbStorage.putAllMLData(mlDbData);

        console.log('ML Data Imported');
    };

    const onClearPeopleIndex = async () => {
        mlIDbStorage.setIndexVersion('people', 0);
    };

    const onDebugFile = async (event: ChangeEvent<HTMLInputElement>) => {
        setDebugFile(event.target.files[0]);
    };

    const onLoadAllPeople = async () => {
        const allPeople = await getAllPeople(100);
        setAllPeople(allPeople);
    };

    const onLoadClusteringResults = async () => {
        const mlLibraryData = await mlIDbStorage.getLibraryData();
        const allFacesMap = await mlIDbStorage.getAllFacesMap();
        const allFaces = getAllFacesFromMap(allFacesMap);

        const clusterPromises = mlLibraryData?.faceClusteringResults?.clusters
            .map((cluster) => cluster?.slice(0, 200).map((f) => allFaces[f]))
            .map((faces) => getFaceCrops(faces));
        setClusters(await Promise.all(clusterPromises));

        const noiseFaces = mlLibraryData?.faceClusteringResults?.noise
            ?.slice(0, 200)
            .map((n) => allFaces[n]);
        setNoiseFaces(await getFaceCrops(noiseFaces));

        const clusteringDebugInfo: DebugInfo =
            mlLibraryData?.faceClusteringResults['debugInfo'];
        if (clusteringDebugInfo) {
            const d3Tree = toD3Tree(
                clusteringDebugInfo.mstBinaryTree,
                allFaces
            );
            console.log(clusteringDebugInfo.mstBinaryTree, d3Tree);
            setMstD3Tree(d3Tree);
        }
    };

    const nodeSize = { x: 180, y: 180 };
    const foreignObjectProps = { width: 112, height: 150, x: -56 };

    // TODO: Remove debug page or config editor from prod
    return (
        <div>
            {/* <div>ClusterFaceDistance: {clusterFaceDistance}</div>
            <button onClick={() => setClusterFaceDistance(0.35)}>0.35</button>
            <button onClick={() => setClusterFaceDistance(0.4)}>0.4</button>
            <button onClick={() => setClusterFaceDistance(0.45)}>0.45</button>
            <button onClick={() => setClusterFaceDistance(0.5)}>0.5</button>
            <button onClick={() => setClusterFaceDistance(0.55)}>0.55</button>
            <button onClick={() => setClusterFaceDistance(0.6)}>0.6</button>

            <p></p> */}

            <Row style={{ margin: '15px' }}>
                <Col>
                    <ConfigEditor
                        name="ML Sync"
                        getConfig={() => getMLSyncConfig()}
                        defaultConfig={() =>
                            Promise.resolve(DEFAULT_ML_SYNC_CONFIG)
                        }
                        setConfig={(mlSyncConfig) =>
                            updateMLSyncConfig(mlSyncConfig as MLSyncConfig)
                        }></ConfigEditor>
                </Col>

                <Col>
                    <ConfigEditor
                        name="ML Sync Job"
                        getConfig={() => getMLSyncJobConfig()}
                        defaultConfig={() =>
                            Promise.resolve(DEFAULT_ML_SYNC_JOB_CONFIG)
                        }
                        setConfig={(mlSyncJobConfig) =>
                            updateMLSyncJobConfig(mlSyncJobConfig as JobConfig)
                        }></ConfigEditor>
                </Col>
            </Row>

            {/* <div>MinFaceSize: {minFaceSize}</div>
            <button onClick={() => setMinFaceSize(16)}>16</button>
            <button onClick={() => setMinFaceSize(24)}>24</button>
            <button onClick={() => setMinFaceSize(32)}>32</button>
            <button onClick={() => setMinFaceSize(64)}>64</button>
            <button onClick={() => setMinFaceSize(112)}>112</button>

            <p></p>
            <div>MinClusterSize: {minClusterSize}</div>
            <button onClick={() => setMinClusterSize(2)}>2</button>
            <button onClick={() => setMinClusterSize(3)}>3</button>
            <button onClick={() => setMinClusterSize(4)}>4</button>
            <button onClick={() => setMinClusterSize(5)}>5</button>
            <button onClick={() => setMinClusterSize(8)}>8</button>
            <button onClick={() => setMinClusterSize(12)}>12</button>

            <p></p>
            <div>Number of Images in Batch: {batchSize}</div>
            <button onClick={() => setBatchSize(50)}>50</button>
            <button onClick={() => setBatchSize(100)}>100</button>
            <button onClick={() => setBatchSize(200)}>200</button>
            <button onClick={() => setBatchSize(500)}>500</button> */}

            {/* <p></p>
            <div>MaxFaceDistance: {maxFaceDistance}</div>
            <button onClick={() => setMaxFaceDistance(0.45)}>0.45</button>
            <button onClick={() => setMaxFaceDistance(0.5)}>0.5</button>
            <button onClick={() => setMaxFaceDistance(0.55)}>0.55</button>
            <button onClick={() => setMaxFaceDistance(0.6)}>0.6</button> */}

            <p></p>
            <button onClick={onSync} disabled>
                Run ML Sync
            </button>
            <button onClick={onStartMLSync}>Start ML Sync</button>
            <button onClick={onStopMLSync}>Stop ML Sync</button>

            <p></p>
            <button onClick={onExportMLData}>Export ML Data</button>
            <button onClick={onImportMLDataClick}>Import ML Data</button>
            <input
                ref={importMLDataFileInput}
                hidden
                type="file"
                onChange={onImportMLData}
            />
            <button onClick={onClearPeopleIndex}>Clear People Index</button>

            <p></p>
            <button onClick={onLoadAllPeople}>
                Load All Identified People
            </button>
            <div>All identified people:</div>
            <PeopleList people={allPeople}></PeopleList>

            <p></p>
            <button onClick={onLoadClusteringResults}>
                Load Clustering Results
            </button>

            <div>Clusters:</div>
            {clusters.map((cluster, index) => (
                <ClusterFacesRow key={index}>
                    {cluster?.map((face, i) => (
                        <ImageBlobView key={i} blob={face}></ImageBlobView>
                    ))}
                </ClusterFacesRow>
            ))}

            <div>Noise:</div>
            <ClusterFacesRow>
                {noiseFaces?.map((face, i) => (
                    <ImageBlobView key={i} blob={face}></ImageBlobView>
                ))}
            </ClusterFacesRow>

            <p></p>
            <input id="debugFile" type="file" onChange={onDebugFile} />
            <MLFileDebugView file={debugFile} />

            <p></p>
            <div>Hdbscan MST: </div>
            <div
                id="treeWrapper"
                style={{
                    width: '100%',
                    height: '50em',
                    backgroundColor: 'white',
                }}>
                {mstD3Tree && (
                    <Tree
                        data={mstD3Tree}
                        orientation={'vertical'}
                        nodeSize={nodeSize}
                        zoom={0.25}
                        renderCustomNodeElement={(rd3tProps) =>
                            renderForeignObjectNode({
                                ...rd3tProps,
                                foreignObjectProps,
                            })
                        }
                    />
                )}
            </div>

            <p></p>
            <div>TSNE of embeddings: </div>
            <div
                id="tsneWrapper"
                style={{
                    width: '840px',
                    height: '840px',
                    backgroundColor: 'white',
                }}>
                {mlResult.tsne && <TSNEPlot mlResult={mlResult} />}
            </div>
        </div>
    );
}