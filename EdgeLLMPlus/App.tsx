import React, {useState, useRef, useEffect} from 'react';
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
} from 'react-native';

import Markdown from 'react-native-markdown-display';

import {initLlama, loadLlamaModelInfo, releaseAllLlama} from 'llama.rn'; // Import llama.rn
import {downloadModel} from './src/api/model'; // Download function
import ProgressBar from './src/components/ProgressBar'; // Progress bar component
import RNFS from 'react-native-fs'; // File system module
// import RNFetchBlob from 'rn-fetch-blob';

import axios from 'axios';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string; // Single thought block
  showThought?: boolean;
};

function App(): React.JSX.Element {
  // const modelPath =
  //   'file:///Users/medmekk/projects/ai/on-device/EdgeLLM/assets/Llama-3.2-1B-Instruct-Q4_K_S.gguf';
  const INITIAL_CONVERSATION: Message[] = [
    {
      role: 'system',
      content:
        'This is a conversation between user and assistant, a friendly chatbot.',
    },
    // {role: 'assistant', content: 'Hi there! How can I help you today?'},
  ];
  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] =
    useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>('');
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]); // List of .gguf files
  const [currentPage, setCurrentPage] = useState<
    'modelSelection' | 'conversation'
  >('modelSelection'); // Navigation state
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [visibleThoughts, setVisibleThoughts] = useState<{
    [key: number]: boolean;
  }>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);

  const modelFormats = [
    {label: 'Llama-3.2-1B-Instruct'},
    {label: 'Qwen2-0.5B-Instruct'},
    {label: 'DeepSeek-R1-Distill-Qwen-1.5B'},
    {label: 'SmolLM2-1.7B-Instruct'},
  ];

  const HF_TO_GGUF = {
    'Llama-3.2-1B-Instruct': 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    'DeepSeek-R1-Distill-Qwen-1.5B':
      'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    'Qwen2-0.5B-Instruct': 'Qwen/Qwen2-0.5B-Instruct-GGUF',
    'SmolLM2-1.7B-Instruct': 'bartowski/SmolLM2-1.7B-Instruct-GGUF',
  };
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);
  const handleGGUFSelection = (file: string) => {
    setSelectedGGUF(file);
    Alert.alert(
      'Confirm Download',
      `Do you want to download ${file} ?`,
      [
        {
          text: 'No',
          onPress: () => setSelectedGGUF(null), // Clear selection if "No"
          style: 'cancel',
        },
        {text: 'Yes', onPress: () => handleDownloadAndNavigate(file)}, // Proceed with download
      ],
      {cancelable: false},
    );
  };

  const handleDownloadAndNavigate = async (file: string) => {
    await handleDownloadModel(file);
    setCurrentPage('conversation'); // Navigate to conversation after download
  };

  const handleBackToModelSelection = () => {
    console.log('In the handleBackToModelSelection');
    setContext(null);
    releaseAllLlama();
    setConversation(INITIAL_CONVERSATION);
    setSelectedGGUF(null);
    setTokensPerSecond([]);
    setCurrentPage('modelSelection');
  };

  const toggleThought = (messageIndex: number) => {
    setConversation(prev =>
      prev.map((msg, index) =>
        index === messageIndex ? {...msg, showThought: !msg.showThought} : msg,
      ),
    );
  };
  const fetchAvailableGGUFs = async (modelFormat: string) => {
    setIsFetching(true);
    console.log(HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]);
    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${
          HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]
        }`,
      );
      console.log(response);
      const files = response.data.siblings.filter((file: any) =>
        file.rfilename.endsWith('.gguf'),
      );
      setAvailableGGUFs(files.map((file: any) => file.rfilename));
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to fetch .gguf files from Hugging Face API.',
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
        .filter(file => file.name.endsWith('.gguf'))
        .map(file => file.name);
      setDownloadedModels(ggufFiles);
    } catch (error) {
      console.error('Error checking downloaded models:', error);
    }
  };
  useEffect(() => {
    checkDownloadedModels();
  }, [currentPage]);

  const checkFileExists = async (filePath: string) => {
    try {
      const fileExists = await RNFS.exists(filePath);
      console.log('File exists:', fileExists);
      return fileExists;
    } catch (error) {
      console.error('Error checking file existence:', error);
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
          'Info',
          `File ${destPath} already exists, we will load it directly.`,
        );
        setIsDownloading(false);
        return;
      }
    }
    try {
      console.log('before download');
      console.log(isDownloading);

      const destPath = await downloadModel(file, downloadUrl, progress =>
        setProgress(progress),
      );
      Alert.alert('Success', `Model downloaded to: ${destPath}`);

      // After downloading, load the model
      await loadModel(file);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Download failed: ${errorMessage}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const stopGeneration = async () => {
    try {
      await context.stopCompletion();
      setIsGenerating(false);
      setIsLoading(false);

      // Optionally add a note that generation was stopped
      setConversation(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage.role === 'assistant') {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMessage,
              content: lastMessage.content + '\n\n*Generation stopped by user*',
            },
          ];
        }
        return prev;
      });
    } catch (error) {
      console.error('Error stopping completion:', error);
    }
  };

  const loadModel = async (modelName: string) => {
    try {
      // const destPath = `${RNFetchBlob.fs.dirs.DocumentDir}/${modelName}.gguf`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
      console.log('destPath : ', destPath);
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
      Alert.alert('Model Loaded', 'The model was successfully loaded.');
      return true;
    } catch (error) {
      console.log('error : ', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error Loading Model', errorMessage);
      return false;
    }
  };

  // useEffect(() => {
  //   if (scrollViewRef.current) {
  //     scrollViewRef.current.scrollToEnd({ animated: true });
  //   }
  // }, [conversation]);

  const handleSendMessage = async () => {
    if (!context) {
      Alert.alert('Model Not Loaded', 'Please load the model first.');
      return;
    }
    if (!userInput.trim()) {
      Alert.alert('Input Error', 'Please enter a message.');
      return;
    }

    const newConversation = [
      ...conversation,
      {role: 'user', content: userInput},
    ];
    setConversation(newConversation);
    setUserInput('');
    setIsLoading(true);
    setIsGenerating(true);
    setAutoScrollEnabled(true);

    try {
      const stopWords = [
        '</s>',
        '<|end|>',
        'user:',
        'assistant:',
        '<|im_end|>',
        '<|eot_id|>',
        '<|end▁of▁sentence|>',
        '<|end_of_text|>',
        '<｜end▁of▁sentence｜>',
      ];
      const chat = newConversation;

      // Append a placeholder for the assistant's response
      setConversation(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '',
          thought: undefined,
          showThought: false,
        },
      ]);
      let currentAssistantMessage = '';
      let currentThought = '';
      let inThinkBlock = false;
      interface CompletionData {
        token: string;
      }

      interface CompletionResult {
        timings: {
          predicted_per_second: number;
        };
      }

      const result: CompletionResult = await context.completion(
        {
          messages: chat,
          n_predict: 10000,
          stop: stopWords,
        },
        (data: CompletionData) => {
          const token = data.token; // Extract the token
          currentAssistantMessage += token; // Append token to the current message

          if (token.includes('<think>')) {
            inThinkBlock = true;
            currentThought = token.replace('<think>', '');
          } else if (token.includes('</think>')) {
            inThinkBlock = false;
            const finalThought = currentThought.replace('</think>', '').trim();

            setConversation(prev => {
              const lastIndex = prev.length - 1;
              const updated = [...prev];

              updated[lastIndex] = {
                ...updated[lastIndex],
                content: updated[lastIndex].content.replace(
                  `<think>${finalThought}</think>`,
                  '',
                ),
                thought: finalThought,
              };

              return updated;
            });

            currentThought = '';
          } else if (inThinkBlock) {
            currentThought += token;
          }

          const visibleContent = currentAssistantMessage
            .replace(/<think>.*?<\/think>/gs, '')
            .trim();

          setConversation(prev => {
            const lastIndex = prev.length - 1;
            const updated = [...prev];
            updated[lastIndex].content = visibleContent;
            return updated;
          });

          if (autoScrollEnabled && scrollViewRef.current) {
            requestAnimationFrame(() => {
              scrollViewRef.current?.scrollToEnd({animated: false});
            });
          }
        },
      );

      // Finalize tokens per second and other metrics after completion
      console.log('result : ', result);
      console.log('conversatin : ', conversation);
      setTokensPerSecond(prev => [
        ...prev,
        parseFloat(result.timings.predicted_per_second.toFixed(2)),
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error During Inference', errorMessage);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scrollView}
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}>
          <Text style={styles.title}>Llama Chat</Text>
          {currentPage === 'modelSelection' && !isDownloading && (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Choose a model format</Text>
              {modelFormats.map(format => (
                <TouchableOpacity
                  key={format.label}
                  style={[
                    styles.button,
                    selectedModelFormat === format.label &&
                      styles.selectedButton,
                  ]}
                  onPress={() => handleFormatSelection(format.label)}>
                  <Text style={styles.buttonText}>{format.label}</Text>
                </TouchableOpacity>
              ))}
              {selectedModelFormat && (
                <View>
                  <Text style={styles.subtitle}>Select a .gguf file</Text>
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
                                setCurrentPage('conversation'),
                                setSelectedGGUF(file))
                              : handleGGUFSelection(file)
                          }>
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
                                ]}>
                                {file.split('-').pop()}
                              </Text>
                            </View>
                            {isDownloaded && (
                              <View style={styles.loadModelIndicator}>
                                <Text style={styles.loadModelText}>
                                  TAP TO LOAD →
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
              {/* {selectedGGUF && (
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={handleDownloadAndNavigate}>
                <Text style={styles.buttonText}>Download and Start Chat</Text>
              </TouchableOpacity>
            )} */}
            </View>
          )}
          {currentPage === 'conversation' && !isDownloading && (
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
                        msg.role === 'user'
                          ? styles.userBubble
                          : styles.llamaBubble,
                      ]}>
                      <Text
                        style={[
                          styles.messageText,
                          msg.role === 'user' && styles.userMessageText,
                        ]}>
                        {msg.thought && (
                          <TouchableOpacity
                            onPress={() => toggleThought(index + 1)} // +1 to account for slice(1)
                            style={styles.toggleButton}>
                            <Text style={styles.toggleText}>
                              {msg.showThought
                                ? '▼ Hide Thought'
                                : '▶ Show Thought'}
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
                      </Text>
                    </View>
                    {msg.role === 'assistant' && (
                      <Text
                        style={styles.tokenInfo}
                        onPress={() => console.log('index : ', index)}>
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
          {currentPage === 'conversation' && (
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
                      onPress={stopGeneration}>
                      <Text style={styles.buttonText}>□ Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.sendButton}
                      onPress={handleSendMessage}
                      disabled={isLoading}>
                      <Text style={styles.buttonText}>
                        {isLoading ? 'Sending...' : 'Send'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackToModelSelection}>
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
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E293B',
    marginVertical: 24,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 16,
    shadowColor: '#475569',
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
    fontWeight: '600',
    color: '#334155',
    marginBottom: 16,
    marginTop: 16,
  },
  subtitle2: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 16,
    color: '#93C5FD',
  },
  button: {
    backgroundColor: '#93C5FD', // Lighter blue
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginVertical: 6,
    shadowColor: '#93C5FD', // Matching lighter shadow color
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15, // Slightly reduced opacity for subtle shadows
    shadowRadius: 4,
    elevation: 2,
  },
  selectedButton: {
    backgroundColor: '#2563EB',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  downloadButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#2563EB',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  chatWrapper: {
    flex: 1,
    padding: 16,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3B82F6',
  },
  llamaBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  messageText: {
    fontSize: 16,
    color: '#334155',
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  tokenInfo: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'right',
  },
  inputContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#334155',
    minHeight: 50,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sendButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },

  stopButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  greetingText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginVertical: 12,
    color: '#64748B', // Soft gray that complements #2563EB
  },
  thoughtContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#94A3B8',
  },
  thoughtTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  thoughtText: {
    color: '#475569',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  toggleButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  toggleText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  modelContainer: {
    marginVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },

  modelButton: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  downloadedModelButton: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 1,
  },

  modelButtonContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  modelStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  downloadedIndicator: {
    backgroundColor: '#DBEAFE',
    padding: 4,
    borderRadius: 6,
    marginRight: 8,
  },

  notDownloadedIndicator: {
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 6,
    marginRight: 8,
  },

  downloadedIcon: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: 'bold',
  },

  notDownloadedIcon: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 'bold',
  },

  downloadedText: {
    color: '#1E40AF',
  },

  loadModelIndicator: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },

  loadModelText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  buttonTextGGUF: {
    color: '#1E40AF',
    fontSize: 14,
    fontWeight: '500',
    
  },

  selectedButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default App;
