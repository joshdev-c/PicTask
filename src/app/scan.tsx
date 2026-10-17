import { useAction, useMutation } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KIND_CHIPS, KindChips, type ScanKind } from '@/components/pictask/kind-chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { uploadPickedFile } from '@/lib/upload';

type PickedFile = {
  uri: string;
  mimeType: string;
  name: string;
};

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
      const documentId = await createDocument({
        storageId,
        fileName: picked.name,
        mimeType: picked.mimeType,
        kindHint: kind,
      });
      router.replace({ pathname: '/review/[documentId]', params: { documentId } });
      void runExtraction({ documentId }).catch(() => {});
    } catch {
      Alert.alert('Could not upload. Check your connection.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KindChips value={kind} onChange={setKind} />
        {picked ? (
          <View style={styles.preview}>
            <Image source={picked.uri} style={styles.previewImage} contentFit="cover" />
            <View style={styles.overlay}>
              <ThemedText type="smallBold" style={styles.overlayText}>
                {kindLabel} selected
              </ThemedText>
            </View>
          </View>
        ) : (
          <ThemedView type="backgroundElement" style={[styles.preview, styles.previewEmpty]}>
            <ThemedText themeColor="textSecondary">No document selected yet</ThemedText>
          </ThemedView>
        )}
        <View style={styles.actions}>
          <PickerButton label="Take photo" onPress={takePhoto} />
          <PickerButton label="Photo library" onPress={pickPhoto} />
          <PickerButton label="Import PDF" onPress={importPdf} />
        </View>
        {picked ? (
          <Pressable style={styles.done} onPress={handleDone} disabled={uploading}>
            <ThemedText type="smallBold" style={styles.doneText}>
              {uploading ? 'Uploading…' : 'Done'}
            </ThemedText>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

function PickerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.button}>
        <ThemedText type="smallBold">{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  preview: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayText: {
    color: '#ffffff',
  },
  actions: {
    gap: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
  },
  done: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
    backgroundColor: '#208AEF',
  },
  doneText: {
    color: '#ffffff',
  },
});
