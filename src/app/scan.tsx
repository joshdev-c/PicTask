import { useAction, useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KIND_CHIPS, KindChips, type ScanKind } from '@/components/pictask/kind-chips';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { uploadPickedFile } from '@/lib/upload';
import type { Id } from '../../convex/_generated/dataModel';

type PickedFile = {
  uri: string;
  mimeType: string;
  name: string;
};

const DETECTED_GREEN = '#7BD3A4';

export default function ScanScreen() {
  const [kind, setKind] = useState<ScanKind>('document');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const createDocument = useMutation(api.documents.create);
  const runExtraction = useAction(api.extract.run);

  const kindLabel = KIND_CHIPS.find((chip) => chip.value === kind)?.label ?? 'Document';

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera access is needed to scan a document.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      name: asset.fileName ?? 'scan.jpg',
    });
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo access is needed to import a document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      name: asset.fileName ?? 'photo.jpg',
    });
  };

  const importPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'application/pdf',
      name: asset.name,
    });
  };

  const handleDone = async () => {
    if (!picked || uploading) return;
    setUploading(true);
    try {
      const { storageId } = await uploadPickedFile({
        uri: picked.uri,
        mimeType: picked.mimeType,
        generateUploadUrl: () => generateUploadUrl({}),
      });
      const documentId: Id<'documents'> = await createDocument({
        storageId,
        fileName: picked.name,
        mimeType: picked.mimeType,
        kindHint: kind,
      });
      router.replace({ pathname: '/review/[documentId]', params: { documentId } });
      void runExtraction({ documentId }).catch(() =>
        Alert.alert('Could not start extraction. Check your connection.'),
      );
    } catch {
      Alert.alert('Could not upload. Check your connection.');
    } finally {
      setUploading(false);
    }
  };

  const isPdf = picked?.mimeType === 'application/pdf';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="smallBold" style={styles.status}>
            {picked ? `${kindLabel} detected` : 'No document selected yet'}
          </ThemedText>

          {picked ? (
            <View style={styles.preview}>
              {isPdf ? (
                <View style={[styles.previewImage, styles.pdfPreview]}>
                  <ThemedText type="heading" style={styles.pdfTitle}>
                    PDF
                  </ThemedText>
                  <ThemedText type="caption" style={styles.pdfName} numberOfLines={2}>
                    {picked.name}
                  </ThemedText>
                </View>
              ) : (
                <Image source={picked.uri} style={styles.previewImage} contentFit="cover" />
              )}
            </View>
          ) : (
            <View style={[styles.preview, styles.previewEmpty]}>
              <ThemedText type="label" style={styles.previewEmptyLabel}>
                DOCUMENT PREVIEW
              </ThemedText>
              <ThemedText type="small" style={styles.previewEmptyHint}>
                Take a photo or import a file to extract its tasks.
              </ThemedText>
            </View>
          )}

          <KindChips value={kind} onChange={setKind} />

          <View style={styles.actions}>
            <PickerButton label="Take photo" onPress={takePhoto} />
            <PickerButton label="Photo library" onPress={pickPhoto} />
            <PickerButton label="Import PDF" onPress={importPdf} />
          </View>

          {picked ? (
            <Pressable
              style={({ pressed }) => [styles.done, pressed ? styles.pressed : null]}
              onPress={handleDone}
              disabled={uploading}>
              <ThemedText type="smallBold" style={styles.doneText}>
                {uploading ? 'Uploading…' : 'Done'}
              </ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PickerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
      <ThemedText type="smallBold" style={styles.buttonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A3A44',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
  },
  status: {
    color: DETECTED_GREEN,
  },
  preview: {
    flex: 1,
    minHeight: 260,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#FBF2DA',
  },
  previewImage: {
    flex: 1,
  },
  previewEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderStyle: 'dashed',
  },
  previewEmptyLabel: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  previewEmptyHint: {
    color: 'rgba(255, 255, 255, 0.56)',
    textAlign: 'center',
    maxWidth: 240,
  },
  pdfPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  pdfTitle: {
    color: '#0A3A44',
  },
  pdfName: {
    color: '#593B00',
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  buttonText: {
    color: '#ffffff',
  },
  done: {
    alignItems: 'center',
    paddingVertical: Spacing.three + Spacing.half,
    borderRadius: Radius.pill,
    backgroundColor: '#F6AE2D',
  },
  doneText: {
    color: '#08232B',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
