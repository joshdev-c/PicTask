import { File, UploadType, type UploadResult } from 'expo-file-system';
import { Platform } from 'react-native';
import type { Id } from '../../convex/_generated/dataModel';

export async function uploadPickedFile(args: {
  uri: string;
  mimeType: string;
  generateUploadUrl: () => Promise<string>;
}): Promise<{ storageId: Id<'_storage'> }> {
  const contentType = args.mimeType.split(';', 1)[0].trim();
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(contentType)) {
    throw new Error(`POST cannot use an invalid content type: ${JSON.stringify(args.mimeType)}`);
  }
  const postUrl = await args.generateUploadUrl();

  let status: number;
  let responseBody: string;
  if (Platform.OS === 'web') {
    let blob: Blob;
    try {
      const response = await fetch(args.uri);
      if (!response.ok) {
        throw new Error(`file read returned HTTP ${response.status}`);
      }
      blob = await response.blob();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`READ failed for ${args.uri} -> ${detail}`);
    }
    if (blob.size === 0) {
      throw new Error(`READ gave an empty file (0 bytes) for ${args.uri}`);
    }

    let result: Response;
    try {
      result = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: blob,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`POST failed (${blob.size} bytes) -> ${detail}`);
    }
    status = result.status;
    responseBody = await result.text();
  } else {
    let result: UploadResult;
    try {
      const file = new File(args.uri);
      if (!file.exists || file.size === 0) {
        throw new Error(`file is missing or empty (${file.size} bytes)`);
      }
      result = await file.upload(postUrl, {
        httpMethod: 'POST',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: contentType,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`POST failed while uploading ${args.uri} -> ${detail}`);
    }
    status = result.status;
    responseBody = result.body;
  }

  if (status < 200 || status >= 300) {
    throw new Error(`POST rejected: HTTP ${status} ${responseBody.slice(0, 200)}`);
  }

  let data: { storageId?: string };
  try {
    data = JSON.parse(responseBody) as { storageId?: string };
  } catch {
    throw new Error(`POST ok but returned invalid JSON: ${responseBody.slice(0, 200)}`);
  }
  if (typeof data.storageId !== 'string' || !data.storageId) {
    throw new Error(`POST ok but no storageId in response: ${responseBody.slice(0, 200)}`);
  }
  return { storageId: data.storageId as Id<'_storage'> };
}
