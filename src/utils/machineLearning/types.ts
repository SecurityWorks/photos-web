import { NormalizedFace } from '@tensorflow-models/blazeface';

export interface MLSyncResult {
    allFaces: FaceImage[];
    clusterResults: ClusteringResults;
}

export interface AlignedFace extends NormalizedFace {
    alignedBox: [number, number, number, number];
}

export declare type FaceEmbedding = Array<number>;

export declare type FaceImage = Array<Array<Array<number>>>;

export interface FaceWithEmbedding {
    fileId: string;
    face: AlignedFace;
    embedding: FaceEmbedding;
    faceImage: FaceImage;
}

export declare type Cluster = Array<number>;

export interface ClusteringResults {
    clusters: Cluster[];
    noise: Cluster;
}