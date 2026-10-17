export async function uploadPickedFile(args: {
  uri: string;
  mimeType: string;
  generateUploadUrl: () => Promise<string>;
}): Promise<{ storageId: string }> {
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
  return (await result.json()) as { storageId: string };
}
