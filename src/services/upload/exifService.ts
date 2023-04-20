import {
    EXIFLESS_FORMATS,
    EXIF_LIBRARY_UNSUPPORTED_FORMATS,
    NULL_LOCATION,
} from 'constants/upload';
import { Location } from 'types/upload';
import exifr from 'exifr';
import piexif from 'piexifjs';
import { FileTypeInfo } from 'types/upload';
import { logError } from 'utils/sentry';
import { getUnixTimeInMicroSeconds } from 'utils/time';
import { CustomError } from 'utils/error';

type ParsedEXIFData = Record<string, any> &
    Partial<{
        DateTimeOriginal: Date;
        CreateDate: Date;
        ModifyDate: Date;
        DateCreated: Date;
        latitude: number;
        longitude: number;
    }>;

type RawEXIFData = Record<string, any> &
    Partial<{
        DateTimeOriginal: string;
        CreateDate: string;
        ModifyDate: string;
        DateCreated: string;
        latitude: number;
        longitude: number;
    }>;

export async function getParsedExifData(
    receivedFile: File,
    fileTypeInfo: FileTypeInfo,
    tags?: string[]
): Promise<ParsedEXIFData> {
    try {
        const exifData: RawEXIFData = await exifr.parse(receivedFile, {
            reviveValues: false,
            tiff: true,
            xmp: true,
            icc: true,
            iptc: true,
            jfif: true,
            ihdr: true,
        });
        const filteredExifData = tags
            ? Object.fromEntries(
                  Object.entries(exifData).filter(([key]) => tags.includes(key))
              )
            : exifData;
        return parseExifData(filteredExifData);
    } catch (e) {
        if (!EXIFLESS_FORMATS.includes(fileTypeInfo.mimeType)) {
            if (
                EXIF_LIBRARY_UNSUPPORTED_FORMATS.includes(fileTypeInfo.mimeType)
            ) {
                logError(e, 'exif library unsupported format', {
                    fileType: fileTypeInfo.exactType,
                });
            } else {
                logError(e, 'get parsed exif data failed', {
                    fileType: fileTypeInfo.exactType,
                });
            }
        }
        throw e;
    }
}

function parseExifData(exifData: RawEXIFData): ParsedEXIFData {
    if (!exifData) {
        return null;
    }
    const { DateTimeOriginal, CreateDate, ModifyDate, DateCreated, ...rest } =
        exifData;
    const parsedExif: ParsedEXIFData = { ...rest };
    if (DateTimeOriginal) {
        parsedExif.DateTimeOriginal = parseEXIFDate(exifData.DateTimeOriginal);
    }
    if (CreateDate) {
        parsedExif.CreateDate = parseEXIFDate(exifData.CreateDate);
    }
    if (ModifyDate) {
        parsedExif.ModifyDate = parseEXIFDate(exifData.ModifyDate);
    }
    if (DateCreated) {
        parsedExif.DateCreated = parseEXIFDate(exifData.DateCreated);
    }
    if (
        exifData.GPSLatitude &&
        exifData.GPSLongitude &&
        exifData.GPSLatitudeRef &&
        exifData.GPSLongitudeRef
    ) {
        const parsedLocation = parseEXIFLocation(
            exifData.GPSLatitude,
            exifData.GPSLatitudeRef,
            exifData.GPSLongitude,
            exifData.GPSLongitudeRef
        );
        parsedExif.latitude = parsedLocation.latitude;
        parsedExif.longitude = parsedLocation.longitude;
    }
    return parsedExif;
}

function parseEXIFDate(dataTimeString: string) {
    try {
        if (typeof dataTimeString !== 'string') {
            throw Error(CustomError.NOT_A_DATE);
        }

        const [year, month, day, hour, minute, second] = dataTimeString
            .match(/\d+/g)
            .map((component) => parseInt(component, 10));

        if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
            throw Error(CustomError.NOT_A_DATE);
        }
        let date: Date;
        if (
            Number.isNaN(hour) ||
            Number.isNaN(minute) ||
            Number.isNaN(second)
        ) {
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(year, month - 1, day, hour, minute, second);
        }
        if (Number.isNaN(+date)) {
            throw Error(CustomError.NOT_A_DATE);
        }
        return date;
    } catch (e) {
        logError(e, 'parseEXIFDate failed', {
            dataTimeString,
        });
        return null;
    }
}

export function parseEXIFLocation(
    gpsLatitude: number[],
    gpsLatitudeRef: string,
    gpsLongitude: number[],
    gpsLongitudeRef: string
) {
    try {
        if (!gpsLatitude || !gpsLongitude) {
            return NULL_LOCATION;
        }
        const latitude = convertDMSToDD(
            gpsLatitude[0],
            gpsLatitude[1],
            gpsLatitude[2],
            gpsLatitudeRef
        );
        const longitude = convertDMSToDD(
            gpsLongitude[0],
            gpsLongitude[1],
            gpsLongitude[2],
            gpsLongitudeRef
        );
        return { latitude, longitude };
    } catch (e) {
        logError(e, 'parseEXIFLocation failed', {
            gpsLatitude,
            gpsLatitudeRef,
            gpsLongitude,
            gpsLongitudeRef,
        });
        return NULL_LOCATION;
    }
}

function convertDMSToDD(
    degrees: number,
    minutes: number,
    seconds: number,
    direction: string
) {
    let dd = degrees + minutes / 60 + seconds / (60 * 60);
    if (direction === 'S' || direction === 'W') dd *= -1;
    return dd;
}

export function getEXIFLocation(exifData: ParsedEXIFData): Location {
    if (!exifData.latitude || !exifData.longitude) {
        return NULL_LOCATION;
    }
    return { latitude: exifData.latitude, longitude: exifData.longitude };
}

export function getEXIFTime(exifData: ParsedEXIFData): number {
    const dateTime =
        exifData.DateTimeOriginal ??
        exifData.DateCreated ??
        exifData.CreateDate ??
        exifData.ModifyDate;
    if (!dateTime) {
        return null;
    }
    return getUnixTimeInMicroSeconds(dateTime);
}

export async function updateFileCreationDateInEXIF(
    reader: FileReader,
    fileBlob: Blob,
    updatedDate: Date
) {
    try {
        let imageDataURL = await convertImageToDataURL(reader, fileBlob);
        imageDataURL =
            'data:image/jpeg;base64' +
            imageDataURL.slice(imageDataURL.indexOf(','));
        const exifObj = piexif.load(imageDataURL);
        if (!exifObj['Exif']) {
            exifObj['Exif'] = {};
        }
        exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] =
            convertToExifDateFormat(updatedDate);

        const exifBytes = piexif.dump(exifObj);
        const exifInsertedFile = piexif.insert(exifBytes, imageDataURL);
        return dataURIToBlob(exifInsertedFile);
    } catch (e) {
        logError(e, 'updateFileModifyDateInEXIF failed');
        return fileBlob;
    }
}

async function convertImageToDataURL(reader: FileReader, blob: Blob) {
    const dataURL = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
    return dataURL;
}

function dataURIToBlob(dataURI: string) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    const byteString = atob(dataURI.split(',')[1]);

    // separate out the mime component
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    // write the bytes of the string to an ArrayBuffer
    const ab = new ArrayBuffer(byteString.length);

    // create a view into the buffer
    const ia = new Uint8Array(ab);

    // set the bytes of the buffer to the correct values
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    // write the ArrayBuffer to a blob, and you're done
    const blob = new Blob([ab], { type: mimeString });
    return blob;
}

function convertToExifDateFormat(date: Date) {
    return `${date.getFullYear()}:${
        date.getMonth() + 1
    }:${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
}
