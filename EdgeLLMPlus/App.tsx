import React, { useState, useRef, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";

import Markdown from "react-native-markdown-display";

import { initLlama, releaseAllLlama } from "llama.rn"; // Import llama.rn
import { downloadModel } from "./src/api/model"; // Download function
import ProgressBar from "./src/components/ProgressBar"; // Progress bar component
import RNFS from "react-native-fs"; // File system module
import axios from "axios";
import { Buffer } from "buffer";
import * as JPEG from "jpeg-js";
import UPNG from "upng-js";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string; // Single thought block
  showThought?: boolean;
};

function App(): React.JSX.Element {
  const INITIAL_CONVERSATION: Message[] = [
    {
      role: "system",
      content:
        "This is a conversation between user and assistant, a friendly chatbot.",
    },
  ];
  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] =
    useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]); // List of .gguf files
  const [currentPage, setCurrentPage] = useState<
    "modelSelection" | "conversation"
  >("modelSelection"); // Navigation state
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string>("");

  const modelFormats = [
    { label: "SmolVLM2-2.2B-Instruct" },
    { label: "Llama-3.2-1B-Instruct" },
    // { label: "Qwen2-0.5B-Instruct" },
    // { label: "DeepSeek-R1-Distill-Qwen-1.5B" },
    // { label: "SmolLM2-1.7B-Instruct" },
  ];

  const HF_TO_GGUF = {
    "SmolVLM2-2.2B-Instruct": "second-state/SmolVLM2-2.2B-Instruct-GGUF",
    "Llama-3.2-1B-Instruct": "medmekk/Llama-3.2-1B-Instruct.GGUF",
    // "DeepSeek-R1-Distill-Qwen-1.5B":
    //   "medmekk/DeepSeek-R1-Distill-Qwen-1.5B.GGUF",
    // "Qwen2-0.5B-Instruct": "medmekk/Qwen2.5-0.5B-Instruct.GGUF",
    // "SmolLM2-1.7B-Instruct": "medmekk/SmolLM2-1.7B-Instruct.GGUF",
  };

  // To handle the scroll view
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);

  const handleGGUFSelection = (file: string) => {
    setSelectedGGUF(file);
    Alert.alert(
      "Confirm Download",
      `Do you want to download ${file} ?`,
      [
        {
          text: "No",
          onPress: () => setSelectedGGUF(null),
          style: "cancel",
        },
        { text: "Yes", onPress: () => handleDownloadAndNavigate(file) },
      ],
      { cancelable: false }
    );
  };

  const handleDownloadAndNavigate = async (file: string) => {
    await handleDownloadModel(file);
    setCurrentPage("conversation"); // Navigate to conversation after download
  };

  const handleBackToModelSelection = () => {
    setContext(null);
    releaseAllLlama();
    setConversation(INITIAL_CONVERSATION);
    setSelectedGGUF(null);
    setTokensPerSecond([]);
    setCurrentPage("modelSelection");
  };

  const toggleThought = (messageIndex: number) => {
    setConversation((prev) =>
      prev.map((msg, index) =>
        index === messageIndex ? { ...msg, showThought: !msg.showThought } : msg
      )
    );
  };
  const fetchAvailableGGUFs = async (modelFormat: string) => {
    setIsFetching(true);
    console.log(HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]);
    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${
          HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]
        }`
      );
      console.log(response);
      const files = response.data.siblings.filter((file: any) =>
        file.rfilename.endsWith(".gguf")
      );
      setAvailableGGUFs(files.map((file: any) => file.rfilename));
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to fetch .gguf files from Hugging Face API."
      );
    } finally {
      setIsFetching(false);
    }
  };

  const handleFormatSelection = (format: string) => {
    setSelectedModelFormat(format);
    setAvailableGGUFs([]); // Clear any previous list
    fetchAvailableGGUFs(format); // Fetch .gguf files for selected format
  };

  const checkDownloadedModels = async () => {
    try {
      const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      const ggufFiles = files
        .filter((file) => file.name.endsWith(".gguf"))
        .map((file) => file.name);
      setDownloadedModels(ggufFiles);
    } catch (error) {
      console.error("Error checking downloaded models:", error);
    }
  };
  useEffect(() => {
    checkDownloadedModels();
  }, [currentPage]);

  const checkFileExists = async (filePath: string) => {
    try {
      const fileExists = await RNFS.exists(filePath);
      console.log("File exists:", fileExists);
      return fileExists;
    } catch (error) {
      console.error("Error checking file existence:", error);
      return false;
    }
  };
  const handleScroll = (event: any) => {
    const currentPosition = event.nativeEvent.contentOffset.y;
    const contentHeight = event.nativeEvent.contentSize.height;
    const scrollViewHeight = event.nativeEvent.layoutMeasurement.height;

    // Store current scroll position and content height
    scrollPositionRef.current = currentPosition;
    contentHeightRef.current = contentHeight;

    // If user has scrolled up more than 100px from bottom, disable auto-scroll
    const distanceFromBottom =
      contentHeight - scrollViewHeight - currentPosition;
    setAutoScrollEnabled(distanceFromBottom < 100);
  };

  const handleDownloadModel = async (file: string) => {
    const downloadUrl = `https://huggingface.co/${
      HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
    }/resolve/main/${file}`;
    setIsDownloading(true);
    setProgress(0);

    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    if (await checkFileExists(destPath)) {
      const success = await loadModel(file);
      if (success) {
        Alert.alert(
          "Info",
          `File ${destPath} already exists, we will load it directly.`
        );
        setIsDownloading(false);
        return;
      }
    }
    try {
      console.log("before download");
      console.log(isDownloading);

      const destPath = await downloadModel(file, downloadUrl, (progress) =>
        setProgress(progress)
      );
      Alert.alert("Success", `Model downloaded to: ${destPath}`);

      // After downloading, load the model
      await loadModel(file);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Download failed: ${errorMessage}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const inferMimeFromPath = (path: string) => {
    const clean = path.split("?")[0].split("#")[0];
    const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    switch (ext) {
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      default:
        return "image/jpeg";
    }
  };

  const toMediaPath = async (uri: string): Promise<string | null> => {
    try {
      if (!uri) return null;

      if (uri.startsWith("file://") || uri.startsWith("/")) {
        const filePath = uri.replace(/^file:\/\//, "");
        return `file://${filePath}`;
      }

      if (uri.startsWith("http://") || uri.startsWith("https://")) {
        const clean = uri.split("?")[0].split("#")[0];
        const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
        const ext = extMatch ? extMatch[1] : "jpg";
        const dest = `${RNFS.CachesDirectoryPath}/llm_img_${Date.now()}.${ext}`;
        const res = RNFS.downloadFile({ fromUrl: uri, toFile: dest });
        await res.promise;
        return `file://${dest}`;
      }

      return null;
    } catch (e) {
      console.error("Failed to resolve image to file path:", e);
      return null;
    }
  };

  const detectMimeFromBytes = (bytes: Uint8Array): string => {
    const header = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log("detectMimeFromBytes - header bytes:", header);
    
    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
      console.log("detectMimeFromBytes - detected BMP");
      return "image/bmp";
    }
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
      console.log("detectMimeFromBytes - detected PNG");
      return "image/png";
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      console.log("detectMimeFromBytes - detected JPEG");
      return "image/jpeg";
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // "WEBP"
    ) {
      console.log("detectMimeFromBytes - detected WebP");
      return "image/webp";
    }
    console.log("detectMimeFromBytes - unknown format");
    return "application/octet-stream";
  };

  const resizeNearestRGBA = (
    src: Uint8Array,
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number
  ): Uint8Array => {
    const dst = new Uint8Array(dstW * dstH * 4);
    for (let y = 0; y < dstH; y++) {
      const sy = Math.floor((y * srcH) / dstH);
      for (let x = 0; x < dstW; x++) {
        const sx = Math.floor((x * srcW) / dstW);
        const si = (sy * srcW + sx) * 4;
        const di = (y * dstW + x) * 4;
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }
    return dst;
  };

  const writeBmp24 = (rgba: Uint8Array, width: number, height: number): Uint8Array => {
    console.log("writeBmp24 - input:", width, "x", height, "RGBA length:", rgba.length);
    
    const rowStride = width * 3;
    const rowPad = (4 - (rowStride % 4)) % 4;
    const imageSize = (rowStride + rowPad) * height;
    const fileSize = 14 + 40 + imageSize;
    
    console.log("writeBmp24 - rowStride:", rowStride, "rowPad:", rowPad, "imageSize:", imageSize, "fileSize:", fileSize);
    
    const out = new Uint8Array(fileSize);
    const dv = new DataView(out.buffer);
    
    // BITMAPFILEHEADER
    out[0] = 0x42; // 'B'
    out[1] = 0x4d; // 'M'
    dv.setUint32(2, fileSize, true);
    dv.setUint32(6, 0, true);
    dv.setUint32(10, 54, true); // pixel data offset
    
    // BITMAPINFOHEADER
    dv.setUint32(14, 40, true); // header size
    dv.setInt32(18, width, true);
    dv.setInt32(22, height, true);
    dv.setUint16(26, 1, true); // planes
    dv.setUint16(28, 24, true); // bpp
    dv.setUint32(30, 0, true); // compression BI_RGB
    dv.setUint32(34, imageSize, true);
    dv.setInt32(38, 2835, true); // x ppm (~72dpi)
    dv.setInt32(42, 2835, true); // y ppm
    dv.setUint32(46, 0, true); // colors used
    dv.setUint32(50, 0, true); // important colors
    
    console.log("writeBmp24 - BMP headers written, starting pixel data at offset 54");
    
    // Pixel data (bottom-up, BGR, padded rows)
    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4;
        if (si + 3 >= rgba.length) {
          console.warn("writeBmp24 - pixel index out of bounds:", si, "rgba.length:", rgba.length);
          out[offset++] = 0; // B
          out[offset++] = 0; // G
          out[offset++] = 0; // R
        } else {
          out[offset++] = rgba[si + 2]; // B
          out[offset++] = rgba[si + 1]; // G
          out[offset++] = rgba[si]; // R
        }
      }
      for (let p = 0; p < rowPad; p++) out[offset++] = 0;
    }
    
    console.log("writeBmp24 - pixel data written, final offset:", offset, "expected:", fileSize);
    
    return out;
  };

  const ensureBmpForMedia = async (
    uri: string,
    options: { maxSize?: number } = {}
  ): Promise<string | null> => {
    try {
      const local = await toMediaPath(uri);
      if (!local) return null;
      const nativePath = local.replace(/^file:\/\//, "");
      console.log("ensureBmpForMedia - input file:", nativePath);
      
      const base64 = await RNFS.readFile(nativePath, "base64");
      const buf = Buffer.from(base64, "base64");
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      console.log("ensureBmpForMedia - input file size:", bytes.length, "bytes");
      
      const mime = detectMimeFromBytes(bytes);
      console.log("ensureBmpForMedia - detected mime:", mime);
      
      if (mime === "image/bmp") {
        console.log("ensureBmpForMedia - already BMP, returning original");
        return local;
      }

      let width = 0;
      let height = 0;
      let rgba: Uint8Array | null = null;

      // Handle WebP by trying to get a different format
      if (mime === "image/webp") {
        console.log("ensureBmpForMedia - WebP detected, trying to get alternative format...");
        try {
          // Try to modify URL to get PNG/JPEG instead of WebP
          let altUri = uri;
          if (uri.includes("format:webp") || uri.includes("format=webp")) {
            altUri = uri.replace(/format[:=]webp/g, "format:jpeg");
            console.log("ensureBmpForMedia - trying alternative URL:", altUri);
            
            const altLocal = await toMediaPath(altUri);
            if (altLocal) {
              const altNativePath = altLocal.replace(/^file:\/\//, "");
              const altBase64 = await RNFS.readFile(altNativePath, "base64");
              const altBuf = Buffer.from(altBase64, "base64");
              const altBytes = new Uint8Array(altBuf.buffer, altBuf.byteOffset, altBuf.byteLength);
              const altMime = detectMimeFromBytes(altBytes);
              
              if (altMime === "image/jpeg" || altMime === "image/png") {
                console.log("ensureBmpForMedia - successfully got alternative format:", altMime);
                // Recursively call with the new format
                return await ensureBmpForMedia(altUri, options);
              }
            }
          }
          
          console.log("ensureBmpForMedia - WebP alternative failed, falling back to 1x1");
          width = 1; height = 1; rgba = new Uint8Array([255,255,255,255]);
        } catch (webpErr) {
          console.warn("ensureBmpForMedia - WebP handling error:", webpErr);
          width = 1; height = 1; rgba = new Uint8Array([255,255,255,255]);
        }
      } else if (mime === "image/png") {
        console.log("ensureBmpForMedia - decoding PNG...");
        const pngBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        console.log("ensureBmpForMedia - PNG buffer size:", pngBuffer.byteLength);
        
        const decoded = UPNG.decode(pngBuffer);
        width = decoded.width as number;
        height = decoded.height as number;
        console.log("ensureBmpForMedia - PNG dimensions:", width, "x", height);
        
        const frames = UPNG.toRGBA8(decoded) as Uint8Array[] | ArrayBuffer[];
        console.log("ensureBmpForMedia - PNG frames count:", frames?.length || 0);
        
        const frame0 = frames && frames.length > 0 ? frames[0] : null;
        if (frame0 instanceof ArrayBuffer) {
          rgba = new Uint8Array(frame0);
        } else if (frame0) {
          rgba = frame0 as Uint8Array;
        }
        console.log("ensureBmpForMedia - PNG RGBA data length:", rgba?.length || 0, "expected:", width * height * 4);
        
        // Alpha composite PNG against white background for 24-bit BMP
        if (rgba && rgba.length === width * height * 4) {
          console.log("ensureBmpForMedia - applying alpha compositing...");
          const composited = new Uint8Array(width * height * 4);
          let transparentPixels = 0;
          for (let i = 0; i < rgba.length; i += 4) {
            const alpha = rgba[i + 3] / 255;
            if (alpha < 1) transparentPixels++;
            composited[i] = Math.round(rgba[i] * alpha + 255 * (1 - alpha)); // R
            composited[i + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha)); // G
            composited[i + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha)); // B
            composited[i + 3] = 255; // A (opaque)
          }
          console.log("ensureBmpForMedia - alpha composited", transparentPixels, "transparent pixels");
          rgba = composited;
        }
      } else if (mime === "image/jpeg") {
        console.log("ensureBmpForMedia - decoding JPEG...");
        const decoded = JPEG.decode(bytes, { useTArray: true });
        width = decoded.width;
        height = decoded.height;
        rgba = decoded.data as unknown as Uint8Array;
        console.log("ensureBmpForMedia - JPEG dimensions:", width, "x", height, "data length:", rgba.length);
      } else {
        console.log("ensureBmpForMedia - unknown format, attempting PNG fallback...");
        // Unknown type, attempt PNG first
        try {
          const pngBuffer2 = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const d2 = UPNG.decode(pngBuffer2);
          width = d2.width as number;
          height = d2.height as number;
          console.log("ensureBmpForMedia - fallback PNG dimensions:", width, "x", height);
          
          const frames2 = UPNG.toRGBA8(d2) as Uint8Array[] | ArrayBuffer[];
          const f0 = frames2 && frames2.length > 0 ? frames2[0] : null;
          if (f0 instanceof ArrayBuffer) {
            rgba = new Uint8Array(f0);
          } else if (f0) {
            rgba = f0 as Uint8Array;
          }
          console.log("ensureBmpForMedia - fallback PNG RGBA length:", rgba?.length || 0);
          
          // Alpha composite PNG against white background
          if (rgba && rgba.length === width * height * 4) {
            console.log("ensureBmpForMedia - applying alpha compositing to fallback PNG...");
            const composited = new Uint8Array(width * height * 4);
            for (let i = 0; i < rgba.length; i += 4) {
              const alpha = rgba[i + 3] / 255;
              composited[i] = Math.round(rgba[i] * alpha + 255 * (1 - alpha)); // R
              composited[i + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha)); // G
              composited[i + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha)); // B
              composited[i + 3] = 255; // A (opaque)
            }
            rgba = composited;
          }
        } catch (e) {
          console.log("ensureBmpForMedia - PNG fallback failed, trying JPEG fallback...", e);
          try {
            const decoded = JPEG.decode(bytes, { useTArray: true });
            width = decoded.width;
            height = decoded.height;
            rgba = decoded.data as unknown as Uint8Array;
            console.log("ensureBmpForMedia - fallback JPEG dimensions:", width, "x", height, "data length:", rgba.length);
          } catch (e2) {
            console.warn("ensureBmpForMedia - all decoders failed, using 1x1 fallback:", e2);
            // Fallback to 1x1 white BMP to guarantee .bmp path
            width = 1; height = 1; rgba = new Uint8Array([255,255,255,255]);
          }
        }
      }

      if (!rgba) {
        console.log("ensureBmpForMedia - no RGBA data, using 1x1 white fallback");
        // Fallback to 1x1 white BMP
        width = 1; height = 1; rgba = new Uint8Array([255,255,255,255]);
      }
      
      console.log("ensureBmpForMedia - final RGBA dimensions before resize:", width, "x", height, "data length:", rgba.length);
      
      // Optional resize if too large
      const maxSize = options.maxSize ?? 1024;
      if (width > maxSize || height > maxSize) {
        const scale = Math.min(maxSize / width, maxSize / height);
        const nw = Math.max(1, Math.floor(width * scale));
        const nh = Math.max(1, Math.floor(height * scale));
        console.log("ensureBmpForMedia - resizing from", width, "x", height, "to", nw, "x", nh, "scale:", scale);
        rgba = resizeNearestRGBA(rgba, width, height, nw, nh);
        width = nw;
        height = nh;
        console.log("ensureBmpForMedia - resized RGBA data length:", rgba.length);
      } else {
        console.log("ensureBmpForMedia - no resize needed, within", maxSize, "px limit");
      }

      console.log("ensureBmpForMedia - writing BMP with dimensions:", width, "x", height);
      const bmpBytes = writeBmp24(rgba, width, height);
      console.log("ensureBmpForMedia - BMP file size:", bmpBytes.length, "bytes");
      
      const bmpBase64 = Buffer.from(bmpBytes).toString("base64");
      const outPath = `${RNFS.CachesDirectoryPath}/llm_img_${Date.now()}.bmp`;
      console.log("ensureBmpForMedia - writing to:", outPath);
      
      await RNFS.writeFile(outPath, bmpBase64, "base64");
      console.log("ensureBmpForMedia - BMP file written successfully");
      
      // Verify the written file
      const stat = await RNFS.stat(outPath);
      console.log("ensureBmpForMedia - written file size:", stat.size, "bytes");
      
      return `file://${outPath}`;
    } catch (e) {
      console.error("ensureBmpForMedia - fatal error:", e);
      console.error("ensureBmpForMedia - error stack:", e instanceof Error ? e.stack : "no stack");
      return null;
    }
  };

  const stopGeneration = async () => {
    try {
      await context.stopCompletion();
      setIsGenerating(false);
      setIsLoading(false);

      setConversation((prev) => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + "\n\n*Generation stopped by user*",
            },
          ];
        }
        return prev;
      });
    } catch (error) {
      console.error("Error stopping completion:", error);
    }
  };

  const loadModel = async (modelName: string) => {
    try {
      const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
      console.log("destPath : ", destPath);
      if (context) {
        await releaseAllLlama();
        setContext(null);
        setConversation(INITIAL_CONVERSATION);
      }
      const llamaContext = await initLlama({
        model: destPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 1,
      });
      setContext(llamaContext);
      try {
        const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const mmprojFile = files.find(
          (f) => f.name.toLowerCase().includes("mmproj") && f.name.endsWith(".gguf")
        );
        if (mmprojFile) {
          const mmprojPath = `${RNFS.DocumentDirectoryPath}/${mmprojFile.name}`;
          console.log("Found mmproj:", mmprojPath);
          console.log("Initializing multimodal (GPU=true)...");
          const initOk = await llamaContext.initMultimodal({ path: mmprojPath, use_gpu: true });
          console.log("initMultimodal success:", initOk);
          const enabled = await llamaContext.isMultimodalEnabled();
          console.log("isMultimodalEnabled:", enabled);
          const support = await llamaContext.getMultimodalSupport();
          console.log("getMultimodalSupport:", support);
        } else {
          console.log("No mmproj .gguf found in app documents. Attempting to fetch from Hugging Face...");
          try {
            const repo = HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF];
            if (repo) {
              const resp = await axios.get(`https://huggingface.co/api/models/${repo}`);
              const siblings = resp.data?.siblings || [];
              const mmprojRemote = siblings.find((f: any) =>
                typeof f.rfilename === "string" &&
                f.rfilename.toLowerCase().includes("mmproj") &&
                f.rfilename.endsWith(".gguf")
              );
              if (mmprojRemote) {
                const mmprojName = mmprojRemote.rfilename.split("/").pop();
                const mmprojDest = `${RNFS.DocumentDirectoryPath}/${mmprojName}`;
                const exists = await RNFS.exists(mmprojDest);
                if (!exists) {
                  const url = `https://huggingface.co/${repo}/resolve/main/${mmprojRemote.rfilename}`;
                  console.log("Downloading mmproj from:", url);
                  await RNFS.downloadFile({ fromUrl: url, toFile: mmprojDest }).promise;
                }
                console.log("Initializing multimodal with downloaded mmproj:", mmprojDest);
                const initOk = await llamaContext.initMultimodal({ path: mmprojDest, use_gpu: true });
                console.log("initMultimodal success:", initOk);
                const enabled = await llamaContext.isMultimodalEnabled();
                console.log("isMultimodalEnabled:", enabled);
                const support = await llamaContext.getMultimodalSupport();
                console.log("getMultimodalSupport:", support);
              } else {
                console.log("No mmproj .gguf found in repo either. Ensure your model provides a projector.");
              }
            }
          } catch (netErr) {
            console.warn("Failed to fetch/init mmproj from repo:", netErr);
          }
        }
      } catch (mmerr) {
        console.warn("Multimodal init error:", mmerr);
      }
      Alert.alert("Model Loaded", "The model was successfully loaded.");
      return true;
    } catch (error) {
      console.log("error : ", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error Loading Model", errorMessage);
      return false;
    }
  };

  const handleSendMessage = async () => {
    if (!context) {
      Alert.alert("Model Not Loaded", "Please load the model first.");
      return;
    }
    if (!userInput.trim() && !imageUrl.trim()) {
      Alert.alert("Input Error", "Please enter a message or provide an image URL.");
      return;
    }

    const attachedImageUrl = imageUrl;
    const userText = userInput; // capture before clearing
    const displayContent = attachedImageUrl
      ? `${userInput}\n\n![image](${attachedImageUrl})`
      : userInput;

    const newConversation: Message[] = [
      ...conversation,
      { role: "user", content: displayContent },
    ];
    setConversation(newConversation);
    setUserInput("");
    setIsLoading(true);
    setIsGenerating(true);
    setAutoScrollEnabled(true);

    try {
      const stopWords = [
        "</s>",
        "<|end|>",
        "user:",
        "assistant:",
        "<|im_end|>",
        "<|eot_id|>",
        "<|end▁of▁sentence|>",
        "<|end_of_text|>",
        "<｜end▁of▁sentence｜>",
      ];
      const chat = newConversation;

      // Append a placeholder for the assistant's response
      setConversation((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          thought: undefined,
          showThought: false,
        },
      ]);
      let currentAssistantMessage = "";
      let currentThought = "";
      let inThinkBlock = false;
      interface CompletionData {
        token: string;
      }

      interface CompletionResult {
        timings: {
          predicted_per_second: number;
        };
      }

//      const mediaPath = attachedImageUrl
//        ? await toMediaPath(attachedImageUrl)
      let mediaPath = attachedImageUrl
        ? await ensureBmpForMedia(attachedImageUrl, { maxSize: 1024 })
        : null;
      if (attachedImageUrl) {
        console.log("image input uri:", attachedImageUrl);
        console.log("image mediaPath:", mediaPath);
      }

      const apiMessages = chat.map((m, idx) => {
        const base = { role: m.role, content: m.content } as any;
        const isLatestUser = m.role === "user" && idx === chat.length - 1;
        if (isLatestUser && mediaPath) {
          const nativePath = mediaPath.replace(/^file:\/\//, "");
          return {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: nativePath } },
            ],
          };
        }
        return base;
      });

      console.log("completion.messages sample:", JSON.stringify(apiMessages.slice(-1)[0], null, 2));
      // Log multimodal capabilities before completion
      try {
        if (context?.isMultimodalEnabled) {
          const enabled = await context.isMultimodalEnabled();
          console.log("isMultimodalEnabled before completion:", enabled);
          if (enabled && context.getMultimodalSupport) {
            const support = await context.getMultimodalSupport();
            console.log("getMultimodalSupport before completion:", support);
          }
        }
      } catch (e) {
        console.log("Multimodal capability check error:", e);
      }

      // Verify media_paths is present after format
      try {
        const formatted = await context.getFormattedChat(apiMessages as any);
        if (typeof formatted === "string") {
          console.log("formatted (llama-chat) length:", formatted.length);
        } else {
          console.log("formatted has_media:", formatted.has_media, "media_paths:", formatted.media_paths);
        }
      } catch (e) {
        console.log("getFormattedChat debug error:", e);
      }

      const result: CompletionResult = await context.completion(
        {
          messages: apiMessages,
          n_predict: 10000,
          stop: stopWords,
        },
        (data: CompletionData) => {
          const token = data.token; // Extract the token
          currentAssistantMessage += token; // Append token to the current message

          if (token.includes("<think>")) {
            inThinkBlock = true;
            currentThought = token.replace("<think>", "");
          } else if (token.includes("</think>")) {
            inThinkBlock = false;
            const finalThought = currentThought.replace("</think>", "").trim();

            setConversation((prev) => {
              const lastIndex = prev.length - 1;
              const updated = [...prev];

              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content.replace(
                  `<think>${finalThought}</think>`,
                  ""
                ),
                thought: finalThought,
              };

              return updated;
            });

            currentThought = "";
          } else if (inThinkBlock) {
            currentThought += token;
          }

          const visibleContent = currentAssistantMessage
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .trim();

          setConversation((prev) => {
            const lastIndex = prev.length - 1;
            const updated = [...prev];
            updated[lastIndex].content = visibleContent;
            return updated;
          });

          if (autoScrollEnabled && scrollViewRef.current) {
            requestAnimationFrame(() => {
              scrollViewRef.current?.scrollToEnd({ animated: false });
            });
          }
        }
      );

      setTokensPerSecond((prev) => [
        ...prev,
        parseFloat(result.timings.predicted_per_second.toFixed(2)),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error During Inference", errorMessage);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
      setImageUrl("");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <Text style={styles.title}>Llama Chat</Text>
          {currentPage === "modelSelection" && !isDownloading && (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Choose a model format</Text>
              {modelFormats.map((format) => (
                <TouchableOpacity
                  key={format.label}
                  style={[
                    styles.button,
                    selectedModelFormat === format.label &&
                      styles.selectedButton,
                  ]}
                  onPress={() => handleFormatSelection(format.label)}
                >
                  <Text style={styles.buttonText}>{format.label}</Text>
                </TouchableOpacity>
              ))}
              {selectedModelFormat && (
                <View>
                  <Text style={styles.subtitle}>Select a .gguf file</Text>
                  {isFetching && (
                    <ActivityIndicator size="small" color="#2563EB" />
                  )}
                  {availableGGUFs.map((file, index) => {
                    const isDownloaded = downloadedModels.includes(file);
                    return (
                      <View key={index} style={styles.modelContainer}>
                        <TouchableOpacity
                          style={[
                            styles.modelButton,
                            selectedGGUF === file && styles.selectedButton,
                            isDownloaded && styles.downloadedModelButton,
                          ]}
                          onPress={() =>
                            isDownloaded
                              ? (loadModel(file),
                                setCurrentPage("conversation"),
                                setSelectedGGUF(file))
                              : handleGGUFSelection(file)
                          }
                        >
                          <View style={styles.modelButtonContent}>
                            <View style={styles.modelStatusContainer}>
                              {isDownloaded ? (
                                <View style={styles.downloadedIndicator}>
                                  <Text style={styles.downloadedIcon}>▼</Text>
                                </View>
                              ) : (
                                <View style={styles.notDownloadedIndicator}>
                                  <Text style={styles.notDownloadedIcon}>
                                    ▽
                                  </Text>
                                </View>
                              )}
                              <Text
                                style={[
                                  styles.buttonTextGGUF,
                                  selectedGGUF === file &&
                                    styles.selectedButtonText,
                                  isDownloaded && styles.downloadedText,
                                ]}
                              >
                                {file.split("-")[-1] == "imat"
                                  ? file
                                  : file.split("-").pop()}
                              </Text>
                            </View>
                            {isDownloaded && (
                              <View style={styles.loadModelIndicator}>
                                <Text style={styles.loadModelText}>
                                  TAP TO LOAD →
                                </Text>
                              </View>
                            )}
                            {!isDownloaded && (
                              <View style={styles.downloadIndicator}>
                                <Text style={styles.downloadText}>
                                  DOWNLOAD →
                                </Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
          {currentPage === "conversation" && !isDownloading && (
            <View style={styles.chatWrapper}>
              <Text style={styles.subtitle2}>Chatting with {selectedGGUF}</Text>
              <View style={styles.chatContainer}>
                <Text style={styles.greetingText}>
                  🦙 Welcome! The Llama is ready to chat. Ask away! 🎉
                </Text>
                {conversation.slice(1).map((msg, index) => (
                  <View key={index} style={styles.messageWrapper}>
                    <View
                      style={[
                        styles.messageBubble,
                        msg.role === "user"
                          ? styles.userBubble
                          : styles.llamaBubble,
                      ]}
                    >
                      <View>
                        {msg.thought && (
                          <TouchableOpacity
                            onPress={() => toggleThought(index + 1)} // +1 to account for slice(1)
                            style={styles.toggleButton}
                          >
                            <Text style={styles.toggleText}>
                              {msg.showThought
                                ? "▼ Hide Thought"
                                : "▶ Show Thought"}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {msg.showThought && msg.thought && (
                          <View style={styles.thoughtContainer}>
                            <Text style={styles.thoughtTitle}>
                              Model's Reasoning:
                            </Text>
                            <Text style={styles.thoughtText}>
                              {msg.thought}
                            </Text>
                          </View>
                        )}
                        <Markdown>{msg.content}</Markdown>
                      </View>
                    </View>
                    {msg.role === "assistant" && (
                      <Text
                        style={styles.tokenInfo}
                        onPress={() => console.log("index : ", index)}
                      >
                        {tokensPerSecond[Math.floor(index / 2)]} tokens/s
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
          {isDownloading && (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Downloading : </Text>
              <Text style={styles.subtitle2}>{selectedGGUF}</Text>
              <ProgressBar progress={progress} />
            </View>
          )}
        </ScrollView>
        <View style={styles.bottomContainer}>
          {currentPage === "conversation" && (
            <>
              <View style={styles.inputContainer}>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="Type your message..."
                    placeholderTextColor="#94A3B8"
                    value={userInput}
                    onChangeText={setUserInput}
                  />
                  {isGenerating ? (
                    <TouchableOpacity
                      style={styles.stopButton}
                      onPress={stopGeneration}
                    >
                      <Text style={styles.buttonText}>□ Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.sendButton}
                      onPress={handleSendMessage}
                      disabled={isLoading}
                    >
                      <Text style={styles.buttonText}>
                        {isLoading ? "Sending..." : "Send"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Image URL (optional, vision model required)"
                    placeholderTextColor="#94A3B8"
                    value={imageUrl}
                    onChangeText={setImageUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackToModelSelection}
              >
                <Text style={styles.backButtonText}>
                  ← Back to Model Selection
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1E293B",
    marginVertical: 24,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    margin: 16,
    shadowColor: "#475569",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 16,
    marginTop: 16,
  },
  subtitle2: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 16,
    color: "#93C5FD",
  },
  button: {
    backgroundColor: "#93C5FD", // Lighter blue
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 6,
    shadowColor: "#93C5FD", // Matching lighter shadow color
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15, // Slightly reduced opacity for subtle shadows
    shadowRadius: 4,
    elevation: 2,
  },
  selectedButton: {
    backgroundColor: "#2563EB",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  chatWrapper: {
    flex: 1,
    padding: 16,
  },
  backButton: {
    backgroundColor: "#3B82F6",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: "80%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#3B82F6",
  },
  llamaBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  messageText: {
    fontSize: 16,
    color: "#334155",
  },
  userMessageText: {
    color: "#FFFFFF",
  },
  tokenInfo: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "right",
  },
  inputContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  input: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#334155",
    minHeight: 50,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  sendButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: "#3B82F6",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: "stretch",
    justifyContent: "center",
  },

  stopButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  greetingText: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginVertical: 12,
    color: "#64748B", // Soft gray that complements #2563EB
  },
  thoughtContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#94A3B8",
  },
  thoughtTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  thoughtText: {
    color: "#475569",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 16,
  },
  toggleButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  toggleText: {
    color: "#3B82F6",
    fontSize: 12,
    fontWeight: "500",
  },

  bottomContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
  },
  modelContainer: {
    marginVertical: 6,
    borderRadius: 12,
    overflow: "hidden",
  },

  modelButton: {
    backgroundColor: "#EFF6FF",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    shadowColor: "#3B82F6",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  downloadedModelButton: {
    backgroundColor: "#EFF6FF",
    borderColor: "#3B82F6",
    borderWidth: 1,
  },

  modelButtonContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modelStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  downloadedIndicator: {
    backgroundColor: "#DBEAFE",
    padding: 4,
    borderRadius: 6,
    marginRight: 8,
  },

  notDownloadedIndicator: {
    backgroundColor: "#F1F5F9",
    padding: 4,
    borderRadius: 6,
    marginRight: 8,
  },

  downloadedIcon: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "bold",
  },

  notDownloadedIcon: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "bold",
  },

  downloadedText: {
    color: "#1E40AF",
  },

  loadModelIndicator: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },

  loadModelText: {
    color: "#3B82F6",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  downloadIndicator: {
    backgroundColor: "#DCF9E5", // Light green background
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },

  downloadText: {
    color: "#16A34A", // Green text
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  buttonTextGGUF: {
    color: "#1E40AF",
    fontSize: 14,
    fontWeight: "500",
  },

  selectedButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

export default App;
