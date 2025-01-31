import React, { useState, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Button,
  Alert,
  TextInput,
} from 'react-native';

import { initLlama, loadLlamaModelInfo, releaseAllLlama } from 'llama.rn'; // Import llama.rn
import  { downloadModel } from './src/api/model'; // Download function
import ProgressBar from './src/components/ProgressBar'; // Progress bar component
import RNFS from 'react-native-fs'; // File system module
// import RNFetchBlob from 'rn-fetch-blob';


import axios from 'axios'

type Message = {
  sender: 'User' | 'Llama';
  text: string;
};

function App(): React.JSX.Element {
  // const modelPath =
  //   'file:///Users/medmekk/projects/ai/on-device/EdgeLLM/assets/Llama-3.2-1B-Instruct-Q4_K_S.gguf';
  const INITIAL_CONVERSATION: Message[] = [
    { sender: 'Llama', text: 'Hi there! How can I help you today?' },
  ]
  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] = useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [selectedModelFormat, setSelectedModelFormat] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]); // List of .gguf files
  const scrollViewRef = useRef<ScrollView>(null); // Ref for ScrollView

  const HF_TO_GGUF = {'Llama-3.2-1B-Instruct': "bartowski/Llama-3.2-1B-Instruct-GGUF"}

  const modelFormats = [
    { label: 'Llama-3.2-1B-Instruct', value: 'llama1B' },
    { label: 'Qwen 1.5', value: 'qwen15' },
  ];

  const ggufFiles: { [key: string]: string[] } = {
    llama1B: ['model-1.gguf', 'model-2.gguf'],
    qwen15: ['qwen1.5-1.gguf', 'qwen1.5-2.gguf'],
  };

  const fetchAvailableGGUFs = async (modelFormat: string) => {
    console.log(modelFormat)
    console.log(HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF])
    try {
      const response = await axios.get(
        `https://huggingface.co/api/models/${HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]}`
      );
      console.log(response)
      const files = response.data.siblings.filter((file: any) => file.rfilename.endsWith('.gguf'));
      setAvailableGGUFs(files.map((file: any) => file.rfilename));
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch .gguf files from Hugging Face API.');
    }
  };

  const handleFormatSelection = (format: string) => {
    setSelectedModelFormat(format);
    setAvailableGGUFs([]); // Clear any previous list
    fetchAvailableGGUFs(format); // Fetch .gguf files for selected format
  };
  
  const checkFileExists = async (filePath) => {
    try {
      const fileExists = await RNFS.exists(filePath);
      console.log('File exists:', fileExists);
      return fileExists;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  };
  

  const handleDownloadModel = async () => {
    if (!selectedGGUF) {
      Alert.alert('Error', 'Please select a model file to download.');
      return;
    }

    const downloadUrl = `https://huggingface.co/${HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]}/resolve/main/${selectedGGUF}`;
    setIsDownloading(true);
    setProgress(0);
    
    const destPath = `${RNFS.DocumentDirectoryPath}/${selectedGGUF}`;
    if (await checkFileExists(destPath)){
      Alert.alert('Info', `File ${destPath} already exists, we will load it directly.`);
      try {
        await loadModel(selectedGGUF); // Call the loadModel function
        console.log('Model loaded successfully @@@@@@@@@@@@@@@@');
        setIsDownloading(false);
        return;
      } catch (error) {
        // If loadModel throws an error, handle it here
        console.error('Failed to load model:', error);
        Alert.alert('Error', 'Could not load the model. We will re-download it.');
        
      }
    } 
    try {
      const destPath = await downloadModel(
        selectedGGUF,
        downloadUrl,
        (progress) => setProgress(progress)
      );
      Alert.alert('Success', `Model downloaded to: ${destPath}`);

      // After downloading, load the model
      await loadModel(selectedGGUF);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Download failed: ${errorMessage}`);
    } finally {
      setIsDownloading(false);
    }
  };


  const loadModel = async (modelName: string) => {
    try {
      // const destPath = `${RNFetchBlob.fs.dirs.DocumentDir}/${modelName}.gguf`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}.gguf`;
      if (context) {
        await releaseAllLlama()
        setContext(null)
        setConversation(INITIAL_CONVERSATION)
      }
      const llamaContext = await initLlama({
        model: destPath,
        use_mlock: true,
        n_ctx: 2048,
        n_gpu_layers: 1,
      });
      setContext(llamaContext);
      Alert.alert('Model Loaded', 'The model was successfully loaded.');
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error Loading Model', errorMessage);
    }
  };

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
      { sender: 'User', text: userInput },
    ];
    setConversation(newConversation);
    setUserInput('');
    setIsLoading(true);

    try {
      const stopWords = ['</s>', '<|end|>', 'User:', 'Llama:'];
      const prompt = newConversation
        .map((msg) => `${msg.sender}: ${msg.text}`)
        .join('\n') + '\nLlama:';

      const result = await context.completion(
        {
          prompt,
          n_predict: 100,
          stop: stopWords,
        },
        (data) => console.log('Partial token:', data.token)
      );

      setConversation([
        ...newConversation,
        { sender: 'Llama', text: result.text.trim() },
      ]);

      // Scroll to the latest message
      // scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      Alert.alert('Error During Inference', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        ref={scrollViewRef} // Attach ref to ScrollView
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }>
        <Text style={styles.title}>Llama Chat</Text>
        <View style={styles.chatContainer}>
          {conversation.map((msg, index) => (
            <View
              key={index}
              style={[
                styles.messageBubble,
                msg.sender === 'User' ? styles.userBubble : styles.llamaBubble,
              ]}>
              <Text style={styles.messageText}>{msg.text}</Text>
            </View>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Type your message..."
          value={userInput}
          onChangeText={setUserInput}
        />
        <Button
          title={isLoading ? 'Sending...' : 'Send'}
          onPress={handleSendMessage}
          disabled={isLoading}
        />
        {/* {!context && <Button title="Load Model" onPress={loadModel} />} */}
        {/* Choose Format */}
        <Text style={styles.subtitle}>Choose a model format:</Text>
        {modelFormats.map((format) => (
          <Button
            key={format.value}
            title={format.label}
            onPress={() => handleFormatSelection(format.label)}
            disabled={isDownloading}
          />
        ))}

        {/* List GGUF files after format selection */}
        {selectedModelFormat && (
          <View style={styles.ggufListContainer}>
            <Text style={styles.subtitle}>Select a .gguf file:</Text>
            {availableGGUFs.map((file, index) => (
              <Button
                key={index}
                title={file}
                onPress={() => setSelectedGGUF(file)}
                disabled={isDownloading}
              />
            ))}
          </View>
        )}

        {/* Download model */}
        {selectedGGUF && !isDownloading && (
          <Button
            title="Download Selected Model"
            onPress={handleDownloadModel}
            disabled={isDownloading}
          />
        )}

        {isDownloading && (
          <>
            <Text style={styles.progressLabel}>Downloading {selectedGGUF}...</Text>
            <ProgressBar progress={progress} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E2C',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  chatContainer: {
    marginBottom: 16,
    padding: 10,
    backgroundColor: '#292A3A',
    borderRadius: 8,
  },
  messageBubble: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    maxWidth: '80%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#4CAF50',
  },
  llamaBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#44475A',
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#44475A',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#2E2E3F',
    color: '#FFFFFF',
    marginBottom: 16,
    fontSize: 16,
  },
  subtitle: {
    fontSize: 18,
    marginVertical: 10,
    color: '#DDD',
  },
  progressLabel: {
    color: '#FFF',
    marginTop: 10,
  },
  ggufListContainer: {
    marginVertical: 10,
  },
});

export default App;





/*
return (
    <SafeAreaView style={styles.container}>
      {currentPage === 'modelSelection' ? (
        <View style={styles.modelSelectionContainer}>
          <Text style={styles.title}>Select a Model</Text>
          {modelFormats.map(model => (
            <TouchableOpacity
              key={model.label}
              style={styles.modelButton}
              onPress={() => handleFormatSelection(model.label)}>
              <Text style={styles.modelButtonText}>{model.label}</Text>
            </TouchableOpacity>
          ))}
          {selectedModelFormat && (
              <View>
                <Text style={styles.subtitle}>Select a .gguf file</Text>
                {isFetching && (
                  <ActivityIndicator size="small" color="#2563EB" />
                )}
                {availableGGUFs.map((file, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      selectedGGUF === file && styles.selectedButton,
                    ]}
                    onPress={() => handleGGUFSelection(file)}>
                    <Text style={styles.buttonTextGGUF}>{file}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          {isDownloading && (
            <View style={styles.downloadProgress}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text>Downloading: {progress}%</Text>
              <ProgressBar progress={progress} />
            </View>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.conversationContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={styles.messagesContainer}
            ref={scrollViewRef}
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({animated: true})
            }>
            {conversation.map((msg, index) => (
              <View key={index} style={styles.messageBubble}>
                <Text style={styles.messageRole}>
                  {msg.role.toUpperCase()}:
                </Text>
                <Text style={styles.messageContent}>{msg.content}</Text>
                {msg.showThought && msg.thought && (
                  <View style={styles.thoughtContainer}>
                    <Text style={styles.thoughtText}>{msg.thought}</Text>
                  </View>
                )}
                {msg.thought && (
                  <TouchableOpacity onPress={() => toggleThought(index)}>
                    <Text style={styles.toggleThoughtText}>
                      {msg.showThought ? 'Hide Thought' : 'Show Thought'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {isGenerating && (
              <ActivityIndicator
                size="large"
                color="#0000ff"
                style={styles.loadingIndicator}
              />
            )}
          </ScrollView>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={userInput}
              onChangeText={setUserInput}
              placeholder="Type your message..."
              multiline
            />
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendMessage}
              disabled={isLoading}>
              <Text style={styles.sendButtonText}>
                {isLoading ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToModelSelection}>
            <Text style={styles.backButtonText}>Back to Model Selection</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modelSelectionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modelButton: {
    width: '100%',
    padding: 15,
    backgroundColor: '#6200ee',
    borderRadius: 8,
    marginVertical: 5,
  },
  modelButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 16,
  },
  downloadProgress: {
    marginTop: 20,
    alignItems: 'center',
  },
  conversationContainer: {
    flex: 1,
    padding: 10,
  },
  messagesContainer: {
    flex: 1,
    marginBottom: 10,
  },
  messageBubble: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageRole: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  messageContent: {
    fontSize: 16,
  },
  thoughtContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
  },
  thoughtText: {
    fontStyle: 'italic',
    color: '#555555',
  },
  toggleThoughtText: {
    color: '#6200ee',
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderColor: '#dddddd',
  },
  textInput: {
    flex: 1,
    height: 40,
    borderColor: '#cccccc',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
    backgroundColor: '#f9f9f9',
  },
  sendButton: {
    backgroundColor: '#6200ee',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  backButton: {
    marginTop: 10,
    alignSelf: 'center',
  },
  backButtonText: {
    color: '#6200ee',
    fontSize: 16,
  },
  loadingIndicator: {
    marginTop: 10,
  },
});

export default App;


