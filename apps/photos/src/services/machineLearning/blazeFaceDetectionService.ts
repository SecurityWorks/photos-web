import {
    load as blazeFaceLoad,
    BlazeFaceModel,
} from 'blazeface-back';
import * as tf from '@tensorflow/tfjs-core';
import { GraphModel } from '@tensorflow/tfjs-converter';
import {
    FaceDetection,
    FaceDetectionMethod,
    FaceDetectionService,
    Versioned,
} from 'types/machineLearning';
import { Box, Point } from '../../../thirdparty/face-api/classes';
import { addPadding, crop, resizeToSquare } from 'utils/image';
import {
    computeTransformToBox,
    transformBox,
    transformPoints,
} from 'utils/machineLearning/transform';
import { enlargeBox, newBox, normFaceBox } from 'utils/machineLearning';
import {
    getNearestDetection,
    removeDuplicateDetections,
    transformPaddedToImage,
} from 'utils/machineLearning/faceDetection';
import {
    BLAZEFACE_FACE_SIZE,
    BLAZEFACE_INPUT_SIZE,
    BLAZEFACE_IOU_THRESHOLD,
    BLAZEFACE_MAX_FACES,
    BLAZEFACE_PASS1_SCORE_THRESHOLD,
    BLAZEFACE_SCORE_THRESHOLD,
    MAX_FACE_DISTANCE_PERCENT,
} from 'constants/mlConfig';
import { addLogLine } from '@ente/shared/logging';

class BlazeFaceDetectionService implements FaceDetectionService {
    private blazeFaceModel: Promise<BlazeFaceModel>;
    private blazeFaceBackModel: GraphModel;
    public method: Versioned<FaceDetectionMethod>;

    private desiredLeftEye = [0.36, 0.45];
    private desiredFaceSize;

    public constructor(desiredFaceSize: number = BLAZEFACE_FACE_SIZE) {
        this.method = {
            value: 'BlazeFace',
            version: 1,
        };
        this.desiredFaceSize = desiredFaceSize;
    }

    private async init() {
        this.blazeFaceModel = blazeFaceLoad({
            maxFaces: BLAZEFACE_MAX_FACES,
            scoreThreshold: BLAZEFACE_PASS1_SCORE_THRESHOLD,
            iouThreshold: BLAZEFACE_IOU_THRESHOLD,
            modelUrl: '/models/blazeface/back/model.json',
            inputHeight: BLAZEFACE_INPUT_SIZE,
            inputWidth: BLAZEFACE_INPUT_SIZE,
        });
        addLogLine(
            'loaded blazeFaceModel: ',
            // await this.blazeFaceModel,
            // eslint-disable-next-line @typescript-eslint/await-thenable
            await tf.getBackend()
        );
    }

    public async detectFacesUsingModel(image: tf.Tensor3D) {
        const resizedImage = tf.image.resizeBilinear(image, [256, 256]);
        const reshapedImage = tf.reshape(resizedImage, [
            1,
            resizedImage.shape[0],
            resizedImage.shape[1],
            3,
        ]);
        const normalizedImage = tf.sub(tf.div(reshapedImage, 127.5), 1.0);
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const results = await this.blazeFaceBackModel.predict(normalizedImage);
        // addLogLine('onFacesDetected: ', results);
        return results;
    }

    private async getBlazefaceModel() {
        if (!this.blazeFaceModel) {
            await this.init();
        }

        return this.blazeFaceModel;
    }

    private async estimateFaces(
        imageBitmap: ImageBitmap
    ): Promise<Array<FaceDetection>> {
        const resized = resizeToSquare(imageBitmap, BLAZEFACE_INPUT_SIZE);
        const tfImage = tf.browser.fromPixels(resized.image);
        const blazeFaceModel = await this.getBlazefaceModel();
        // TODO: check if this works concurrently, else use serialqueue
        const faces = await blazeFaceModel.estimateFaces(tfImage);
        tf.dispose(tfImage);

        const inBox = newBox(0, 0, resized.width, resized.height);
        const toBox = newBox(0, 0, imageBitmap.width, imageBitmap.height);
        const transform = computeTransformToBox(inBox, toBox);
        // addLogLine("1st pass: ", { transform });

        const faceDetections: Array<FaceDetection> = faces?.map((f) => {
            const box = transformBox(normFaceBox(f), transform);
            const normLandmarks = (f.landmarks as number[][])?.map(
                (l) => new Point(l[0], l[1])
            );
            const landmarks = transformPoints(normLandmarks, transform);
            return {
                box,
                landmarks,
                probability: f.probability as number,
                // detectionMethod: this.method,
            } as FaceDetection;
        });

        return faceDetections;
    }

    public async detectFaces(
        imageBitmap: ImageBitmap
    ): Promise<Array<FaceDetection>> {
        const maxFaceDistance = imageBitmap.width * MAX_FACE_DISTANCE_PERCENT;
        const pass1Detections = await this.estimateFaces(imageBitmap);

        // run 2nd pass for accuracy
        const detections: Array<FaceDetection> = [];
        for (const pass1Detection of pass1Detections) {
            const imageBox = enlargeBox(pass1Detection.box, 2);
            const faceImage = crop(
                imageBitmap,
                imageBox,
                BLAZEFACE_INPUT_SIZE / 2
            );
            const paddedImage = addPadding(faceImage, 0.5);
            const paddedBox = enlargeBox(imageBox, 2);
            const pass2Detections = await this.estimateFaces(paddedImage);

            pass2Detections?.forEach((d) =>
                transformPaddedToImage(d, faceImage, imageBox, paddedBox)
            );
            let selected = pass2Detections?.[0];
            if (pass2Detections?.length > 1) {
                // addLogLine('2nd pass >1 face', pass2Detections.length);
                selected = getNearestDetection(
                    pass1Detection,
                    pass2Detections
                    // maxFaceDistance
                );
            }

            // we might miss 1st pass face actually having score within threshold
            // it is ok as results will be consistent with 2nd pass only detections
            if (selected && selected.probability >= BLAZEFACE_SCORE_THRESHOLD) {
                // addLogLine("pass2: ", { imageBox, paddedBox, transform, selected });
                detections.push(selected);
            }
        }

        return removeDuplicateDetections(detections, maxFaceDistance);
    }

    public async dispose() {
        const blazeFaceModel = await this.getBlazefaceModel();
        blazeFaceModel?.dispose();
        this.blazeFaceModel = undefined;
    }
}

export default new BlazeFaceDetectionService();
