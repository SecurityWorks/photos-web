import { BlobOptions, Dimensions } from 'types/image';
import {
    AlignedFace,
    FaceCropConfig,
    FaceCrop,
    StoredFaceCrop,
} from 'types/machineLearning';
import { cropWithRotation, imageBitmapToBlob } from 'utils/image';
import { enlargeBox } from '.';
import { getAlignedFaceBox } from './faceAlign';

export function getFaceCrop(
    imageBitmap: ImageBitmap,
    alignedFace: AlignedFace,
    config: FaceCropConfig
): FaceCrop {
    const box = getAlignedFaceBox(alignedFace);
    const scaleForPadding = 1 + config.padding * 2;
    const paddedBox = enlargeBox(box, scaleForPadding).round();
    const faceImageBitmap = cropWithRotation(imageBitmap, paddedBox, 0, {
        width: config.maxSize,
        height: config.maxSize,
    });

    return {
        image: faceImageBitmap,
        imageBox: paddedBox,
    };
}

export async function getStoredFaceCrop(
    faceCrop: FaceCrop,
    blobOptions: BlobOptions
): Promise<StoredFaceCrop> {
    const faceCropBlob = await imageBitmapToBlob(faceCrop.image, blobOptions);
    return {
        image: faceCropBlob,
        imageBox: faceCrop.imageBox,
    };
}

export async function ibExtractFaceImageFromCrop(
    alignedFace: AlignedFace,
    faceSize: number
): Promise<ImageBitmap> {
    const image = alignedFace.faceCrop?.image;
    const imageBox = alignedFace.faceCrop?.imageBox;
    if (!image || !imageBox) {
        throw Error('Face crop not present');
    }

    const box = getAlignedFaceBox(alignedFace);
    const faceCropImage = await createImageBitmap(alignedFace.faceCrop.image);

    const scale = faceCropImage.width / imageBox.width;
    const scaledImageBox = alignedFace.faceCrop.imageBox.rescale(scale).round();
    const scaledBox = box.rescale(scale).round();
    const shiftedBox = scaledBox.shift(-scaledImageBox.x, -scaledImageBox.y);
    // console.log({ box, imageBox, faceCropImage, scale, scaledBox, scaledImageBox, shiftedBox });

    const faceSizeDimentions: Dimensions = {
        width: faceSize,
        height: faceSize,
    };
    const faceImage = cropWithRotation(
        faceCropImage,
        shiftedBox,
        alignedFace.rotation,
        faceSizeDimentions,
        faceSizeDimentions
    );

    return faceImage;
}