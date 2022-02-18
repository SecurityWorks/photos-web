import React, { useEffect, useRef, useState } from 'react';
import '@tensorflow/tfjs-backend-webgl';
import arcfaceAlignmentService from 'services/machineLearning/arcfaceAlignmentService';
import arcfaceCropService from 'services/machineLearning/arcfaceCropService';
import blazeFaceDetectionService from 'services/machineLearning/blazeFaceDetectionService';
import { AlignedFace, FaceCrop } from 'types/machineLearning';
import { getMLSyncConfig } from 'utils/machineLearning/config';
import {
    getAlignedFaceBox,
    ibExtractFaceImage,
    ibExtractFaceImageUsingTransform,
} from 'utils/machineLearning/faceAlign';
import { ibExtractFaceImageFromCrop } from 'utils/machineLearning/faceCrop';
import { FaceCropsRow, FaceImagesRow, ImageBitmapView } from './ImageViews';

interface MLFileDebugViewProps {
    file: File;
}

function drawFaceDetection(face: AlignedFace, ctx: CanvasRenderingContext2D) {
    const pointSize = Math.ceil(
        Math.max(ctx.canvas.width / 512, face.detection.box.width / 32)
    );

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = pointSize;
    ctx.strokeRect(
        face.detection.box.x,
        face.detection.box.y,
        face.detection.box.width,
        face.detection.box.height
    );
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = Math.round(pointSize * 1.5);
    const alignedBox = getAlignedFaceBox(face.alignment);
    ctx.strokeRect(
        alignedBox.x,
        alignedBox.y,
        alignedBox.width,
        alignedBox.height
    );
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 255, 0.8)';
    face.detection.landmarks.forEach((l) => {
        ctx.beginPath();
        ctx.arc(l.x, l.y, pointSize, 0, Math.PI * 2, true);
        ctx.fill();
    });
    ctx.restore();
}

export default function MLFileDebugView(props: MLFileDebugViewProps) {
    // const [imageBitmap, setImageBitmap] = useState<ImageBitmap>();
    const [faceCrops, setFaceCrops] = useState<FaceCrop[]>();
    const [facesUsingCrops, setFacesUsingCrops] = useState<ImageBitmap[]>();
    const [facesUsingImage, setFacesUsingImage] = useState<ImageBitmap[]>();
    const [facesUsingTransform, setFacesUsingTransform] =
        useState<ImageBitmap[]>();

    const canvasRef = useRef(null);

    useEffect(() => {
        let didCancel = false;
        const loadFile = async () => {
            // TODO: go through worker for these apis, to not include ml code in main bundle
            const imageBitmap = await createImageBitmap(props.file);
            const faceDetections = await blazeFaceDetectionService.detectFaces(
                imageBitmap
            );
            console.log('detectedFaces: ', faceDetections.length);

            const mlSyncConfig = await getMLSyncConfig();
            const faceCropPromises = faceDetections.map(async (faceDetection) =>
                arcfaceCropService.getFaceCrop(
                    imageBitmap,
                    faceDetection,
                    mlSyncConfig.faceCrop
                )
            );

            const faceCrops = await Promise.all(faceCropPromises);
            if (didCancel) return;
            setFaceCrops(faceCrops);

            const faceAlignments = faceDetections.map((detection) =>
                arcfaceAlignmentService.getFaceAlignment(detection)
            );
            console.log('alignedFaces: ', faceAlignments);

            const canvas: HTMLCanvasElement = canvasRef.current;
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;
            const ctx = canvas.getContext('2d');
            if (didCancel) return;
            ctx.drawImage(imageBitmap, 0, 0);
            const alignedFaces = faceAlignments.map((alignment, i) => {
                return {
                    detection: faceDetections[i],
                    alignment,
                } as AlignedFace;
            });
            alignedFaces.forEach((alignedFace) =>
                drawFaceDetection(alignedFace, ctx)
            );

            const facesUsingCrops = await Promise.all(
                alignedFaces.map((face, i) => {
                    return ibExtractFaceImageFromCrop(
                        faceCrops[i],
                        face.alignment,
                        112
                    );
                })
            );
            const facesUsingImage = await Promise.all(
                alignedFaces.map((face) => {
                    return ibExtractFaceImage(imageBitmap, face.alignment, 112);
                })
            );
            const facesUsingTransform = await Promise.all(
                alignedFaces.map((face) => {
                    return ibExtractFaceImageUsingTransform(
                        imageBitmap,
                        face.alignment,
                        112
                    );
                })
            );

            if (didCancel) return;
            setFacesUsingCrops(facesUsingCrops);
            setFacesUsingImage(facesUsingImage);
            setFacesUsingTransform(facesUsingTransform);
        };

        props.file && loadFile();
        return () => {
            didCancel = true;
        };
    }, [props.file]);

    return (
        <div>
            <p></p>
            {/* <ImageBitmapView image={imageBitmap}></ImageBitmapView> */}
            <canvas
                ref={canvasRef}
                width={0}
                height={0}
                style={{ maxWidth: '100%' }}
            />
            <p></p>
            <div>Face Crops:</div>
            <FaceCropsRow>
                {faceCrops?.map((faceCrop, i) => (
                    <ImageBitmapView
                        key={i}
                        image={faceCrop.image}></ImageBitmapView>
                ))}
            </FaceCropsRow>

            <p></p>

            <div>Face Images using face crops:</div>
            <FaceImagesRow>
                {facesUsingCrops?.map((image, i) => (
                    <ImageBitmapView key={i} image={image}></ImageBitmapView>
                ))}
            </FaceImagesRow>

            <div>Face Images using original image:</div>
            <FaceImagesRow>
                {facesUsingImage?.map((image, i) => (
                    <ImageBitmapView key={i} image={image}></ImageBitmapView>
                ))}
            </FaceImagesRow>

            <div>Face Images using transfrom:</div>
            <FaceImagesRow>
                {facesUsingTransform?.map((image, i) => (
                    <ImageBitmapView key={i} image={image}></ImageBitmapView>
                ))}
            </FaceImagesRow>
        </div>
    );
}