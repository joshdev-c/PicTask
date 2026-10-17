import type { Id } from '../../convex/_generated/dataModel';
export async function uploadPickedFile(args: {
  uri: string;
  mimeType: string;
  generateUploadUrl: () => Promise<string>;
}): Promise<{ storageId: Id<'_storage'> }> {
  const postUrl = await args.generateUploadUrl();
  const response = await fetch(args.uri);
  const blob = await response.blob();
  const result = await fetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': args.mimeType },
    body: blob,
  });
  if (!result.ok) {
    throw new Error('Upload failed');
  }
  const data: { storageId: string } = await result.json();

  return {
    storageId: data.storageId as Id<'_storage'>,
  };
}
