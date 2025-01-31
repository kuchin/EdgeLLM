# **Build a React Native App to Chat locally with an LLM: A Step-by-Step Guide**

Did you ever wonder how you can create a mobile app to chat with LLMs locally? Have you tried to understand the code in some open source projects but found it too complex? Well, this blog is for you! We will help you build a simple React Native app to chat with LLMs downloaded from the **Hugging Face** hub. React Native makes it easy to create cross-platform mobile apps, and Large Language Models (LLMs) have brought conversational AI into the spotlight. In this guide, we'll walk through building a simple React Native app that lets users chat with an LLM locally, without the need of an API - everything is private and runs on device.

---

## **Why This Tutorial?**

This blog is for anyone who:

- Is curious about integrating AI into mobile apps
- Wants to build a conversational app that works on both Android and iOS
- Is interested in privacy-focused AI applications that run completely offline

By the end of this guide, you'll have a working app to chat with your favorite smol hub models.

---

## **1. Setting Up Your Environment**

React Native requires some setup before you can start coding.

### **Tools You Need**

1. **Node.js:** Install from [Node.js downloads](https://nodejs.org/en/download)
2. **react-native-community/cli:** Run the following to install:

```bash
npm i @react-native-community/cli
```

### **Emulator Setup**

To run your app during development you will need an emulator:

- **For Mac Users:**

  - Can run both Android and iOS emulators
  - For iOS: Install Xcode -> Open Developer Tools -> Simulator
  - For Android: Install Java Runtime and Android Studio -> Go to Device Manager and Create an emulator

- **For PC Users:**
  - Install Java Runtime and Android Studio for Android development
  - For iOS testing options:
    - Cloud-based simulators like [LambdaTest](https://www.lambdatest.com/test-on-iphone-simulator) and [BrowserStack](https://www.browserstack.com/test-on-ios-simulator)
    - Third party emulators that try to mimic iOS behavior but we didn't test them.

Follow the excellent tutorial by Expo for Android Studio setup: [Android Studio Emulator Guide](https://docs.expo.dev/workflow/android-studio-emulator/)

## **2. Create the App**

Let's start this project! First, we need to initiate the app using @react-native-community/cli:

```bash
npx @react-native-community/cli@latest init <ProjectName>
```

### **Project Structure**

The app folder architecture for a new project includes:

#### **Default Files/Folders**

1. `android/`

   - Contains native Android project files
   - **Purpose**: To build and run the app on Android devices

2. `ios/`

   - Contains native iOS project files
   - **Purpose**: To build and run the app on iOS devices

3. `node_modules/`

   - **Purpose**: Holds all npm dependencies used in the project

4. `App.js`

   - The main root component of your app
   - **Purpose**: Entry point to the app's UI and logic

5. `index.js`
   - Registers the root component (`App`)
   - **Purpose**: Entry point for React Native runtime

#### **Additional Configuration Files**

- `tsconfig.json`: Configures TypeScript settings

```json
{
  "compilerOptions": {
    "target": "es5",
    "module": "commonjs",
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- `babel.config.js`: Configures Babel for transpiling modern JavaScript/TypeScript.
- `jest.config.js`: Configures Jest for testing React Native components and logic.
- `metro.config.js`: Customizes the Metro bundler for the project. The Metro bundler is a JavaScript bundler specifically designed for React Native. It takes your project’s JavaScript and assets, bundles them into a single file (or multiple files for efficient loading), and serves them to the app during development. Metro is optimized for fast incremental builds, supports hot reloading, and handles React Native’s platform-specific files (.ios.js or .android.js). It ensures your app gets the right code and assets.
- `.watchmanconfig`: Configures Watchman, a file-watching service used by React Native for hot reloading.

## **3. How to Debug**

### **Running the App**

Debugging a React Native application requires either an emulator or a physical device. We'll focus on using an emulator since it provides a more streamlined development experience with your code editor and debugging tools side by side.

Start by ensuring your development environment is ready:

```bash
# Install dependencies
npm install

# Start the Metro bundler
npm start
```

In a new terminal, launch the app on your chosen platform:

```bash
# For iOS
npm run ios

# For Android
npm run android
```

This should launch the app on your emulator.

### **Chrome DevTools Debugging**

For debugging you will use Chrome DevTools as in web development :

1. Press `j` in the Metro bundler terminal to launch Chrome DevTools

![alt text](assets/blog_images/dev_tools.png)

2. Navigate to the "Sources" tab
3. Find your source files
4. Set breakpoints by clicking on line numbers
5. Use debugging controls:
   - Step Over - Execute current line
   - Step Into - Enter function call
   - Step Out - Exit current function
   - Continue - Run until next breakpoint

### **Common Debugging Tips**

1. **Console Logging**

```javascript
console.log('Debug value:', someValue);
console.warn('Warning message');
console.error('Error details');
```

2. **Metro Bundler Issues**

```bash
# Clear Metro bundler cache
npm start --reset-cache
```

3. **Build Errors**

```bash
# Clean and rebuild
cd android && ./gradlew clean
cd ios && pod install
```

## **4. App Implementation**

### **Installing Dependencies**

First, let's install the required packages. We aim to load models from the Hugging Face Hub and run them locally. To achieve this, we need to install :

- `llama.rn`: a binding for `llama.cpp` tailored for React Native apps.
- `react-native-fs`: allows us to manage the device's file system in a React Native environment.
- `axios`: a library for sending requests to the Hugging Face Hub API.

```bash
npm install axios react-native-fs llama.rn
```

Let's run the app on our simulator so we can start the development

### **State Management**

We will start by deleting everyting from the App.tsx file, and creating an empty code structure like the following :

```typescript
import React from 'react';
import {StyleSheet, View} from 'react-native';

function App(): React.JSX.Element {
  return <View> </View>;
}
const styles = StyleSheet.create({});

export default App;
```

Let's think about what our app needs to track:

1. **Chat-related State**:

   - The conversation history (messages between user and AI)
   - Current user input

2. **Model-related State**:
   - Selected model format (like Llama 1B or Qwen 1.5B)
   - Available GGUF files list for each model model format
   - Selected GGUF file
   - Model download progress
   - A context to store the loaded model
   - A boolean to check if the model is downloading
   - A boolean to check if the model is generating
     Here's how we implement this using React's useState hook (we will need to import it from react)

```typescript
import { useState } from 'react';
...
type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const INITIAL_CONVERSATION: Message[] = [
    {
      role: 'system',
      content:
        'This is a conversation between user and assistant, a friendly chatbot.',
    },

const [conversation, setConversation] = useState<Message[]>(INITIAL_CONVERSATION);
const [selectedModelFormat, setSelectedModelFormat] = useState<string>('');
const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
const [availableGGUFs, setAvailableGGUFs] = useState<string[]>([]);
const [userInput, setUserInput] = useState<string>('');
const [progress, setProgress] = useState<number>(0);
const [context, setContext] = useState<any>(null);
const [isDownloading, setIsDownloading] = useState<boolean>(false);
const [isGenerating, setIsGenerating] = useState<boolean>(false);
```

The Message type defines the structure of chat messages, specifying that each message must have a role (either 'user' or 'assistant' or 'system') and content (the actual message text).

Now that we have our basic state management set up, we need to think about how to:

1. Fetch available models from Hugging Face
2. Download and manage models locally
3. Create the chat interface
4. Handle message generation

Let's tackle these one by one in the next sections...

### **Fetching available GGUF models from the Hub**

Let's start by defining the model formats our app is going to support and their corresponding GGUF repositories:

```typescript
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
```

The `HF_TO_GGUF` object maps user-friendly model names to their corresponding Hugging Face repository paths. For example:

- When a user selects 'Llama-3.2-1B-Instruct', it maps to 'bartowski/Llama-3.2-1B-Instruct-GGUF'

The `modelFormats` array contains the list of model options that will be displayed to users in the selection screen. Each model format is represented as an object with a `label` property containing the user-friendly name.

Next, let's create a way to fetch and display available GGUF model files from the hub for our selected model format.

When a user selects a model format, we make an API call to Hugging Face using the repository path we mapped in our `HF_TO_GGUF` object. We're specifically looking for files that end with '.gguf' extension, which are our quantized model files.

Once we receive the response, we extract just the filenames of these GGUF files and store them in our `availableGGUFs` state using `setAvailableGGUFs`. This allows us to show users a list of available GGUF model variants they can download.

```typescript
const fetchAvailableGGUFs = async (modelFormat: string) => {
  if (!modelFormat) {
    Alert.alert('Error', 'Please select a model format first.');
    return;
  }

  try {
    const repoPath = HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF];
    if (!repoPath) {
      throw new Error(
        `No repository mapping found for model format: ${modelFormat}`,
      );
    }

    const response = await axios.get(
      `https://huggingface.co/api/models/${repoPath}`,
    );

    if (!response.data?.siblings) {
      throw new Error('Invalid API response format');
    }

    const files = response.data.siblings.filter((file: {rfilename: string}) =>
      file.rfilename.endsWith('.gguf'),
    );

    setAvailableGGUFs(files.map((file: {rfilename: string}) => file.rfilename));
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch .gguf files';
    Alert.alert('Error', errorMessage);
    setAvailableGGUFs([]);
  }
};
```

### **Model Download Implementation**

Now let's implement the model download functionality in the `handleDownloadModel` function which should be called when the user clicks on the download button. This will download the selected GGUF file from Hugging Face and store it in the app's Documents directory:

```typescript
const handleDownloadModel = async (file: string) => {
  const downloadUrl = `https://huggingface.co/${
    HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
  }/resolve/main/${file}`;
  // we set the isDownloading state to true to show the progress bar and set the progress to 0
  setIsDownloading(true);
  setProgress(0);

  try {
    // we download the model using the downloadModel function, it takes the selected GGUF file, the download URL, and a progress callback function to update the progress bar
    const destPath = await downloadModel(file, downloadUrl, progress =>
      setProgress(progress),
    );

    // Ensure the model is loaded only if the download was successful
    if (destPath) {
      // Will be implemented in the next section
      await loadModel(file);
    } else {
      throw new Error('Model download path is invalid.');
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Download failed due to an unknown error.';
    Alert.alert('Error', errorMessage);
  } finally {
    setIsDownloading(false);
  }
};
```

The `downloadModel` function, located in `src/api`, accepts three parameters: `modelName`, `downloadUrl`, and a `progress` callback function. This callback is triggered during the download process to update the progress. The `RNFS` module, part of the `react-native-fs` library, provides file system access for React Native applications. It allows developers to read, write, and manage files on the device's storage. In this case, the model is stored in the app's Documents folder using `RNFS.DocumentDirectoryPath`, ensuring that the downloaded file is accessible to the app. The progress bar is updated accordingly to reflect the current download status. The progress bar component is defined in the `components` folder.

Let's create `src/api/model.ts` and copy the code from the `src/api/model.ts` file in the repo. The logic should be simple to understand. The same goes for the progress bar component in the `src/components` folder.

### **Model Loading and Initialization**

Next, we will implement a function to load the downloaded model into a Llama context, as detailed in the `llama.rn` documentation available [here](https://github.com/mybigday/llama.rn). If a context is already present, we will release it, set the context to `null`, and reset the conversation to its initial state. Subsequently, we will utilize the `initLlama` function to load the model into a new context and update our state with the newly initialized context.

```typescript
import {initLlama, releaseAllLlama} from 'llama.rn';
import RNFS from 'react-native-fs'; // File system module
...
const loadModel = async (modelName: string) => {
  try {
    const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;

    // Ensure the model file exists before attempting to load it
    const fileExists = await RNFS.exists(destPath);
    if (!fileExists) {
      Alert.alert('Error Loading Model', 'The model file does not exist.');
      return false;
    }

    if (context) {
      await releaseAllLlama();
      setContext(null);
      setConversation(INITIAL_CONVERSATION);
    }

    const llamaContext = await initLlama({
      model: destPath,
      use_mlock: true,
      n_ctx: 2048,
      n_gpu_layers: 1
    });

    setContext(llamaContext);
    return true;
  } catch (error) {
    Alert.alert('Error Loading Model', error instanceof Error ? error.message : 'An unknown error occurred.');
    return false;
  }
};
```

### **Chat Implementation**

With the model now loaded into our context, we can proceed to implement the conversation logic. We'll define a function called `handleSendMessage`, which will be triggered when the user submits their input. This function will update the conversation state and send the updated conversation to the model via `context.completion`. The response from the model will then be used to further update the conversation, which means that the conversation will be updated twice in this function.

```typescript
const handleSendMessage = async () => {
  // Check if context is loaded and user input is valid
  if (!context) {
    Alert.alert('Model Not Loaded', 'Please load the model first.');
    return;
  }

  if (!userInput.trim()) {
    Alert.alert('Input Error', 'Please enter a message.');
    return;
  }

  const newConversation: Message[] = [
    // ... is a spread operator that spreads the previous conversation array to which we add the new user message
    ...conversation,
    {role: 'user', content: userInput},
  ];
  setIsGenerating(true);
  // Update conversation state and clear user input
  setConversation(newConversation);
  setUserInput('');

  try {
    const stopWords = [
      '</s>',
      '<|end|>',
      'user:',
      'assistant:',
      '<|im_end|>',
      '<|eot_id|>',
      '<|end▁of▁sentence|>',
      '<｜end▁of▁sentence｜>',
    ];
    const result = await context.completion({
      messages: newConversation,
      n_predict: 10000,
      stop: stopWords,
    });

    // Ensure the result has text before updating the conversation
    if (result && result.text) {
      setConversation(prev => [
        ...prev,
        {role: 'assistant', content: result.text.trim()},
      ]);
    } else {
      throw new Error('No response from the model.');
    }
  } catch (error) {
    // Handle errors during inference
    Alert.alert(
      'Error During Inference',
      error instanceof Error ? error.message : 'An unknown error occurred.',
    );
  }
};
```

### **The UI && Logic**

Now that we have the core functionality implemented, we can focus on the UI. The UI is straightforward, consisting of a model selection screen with a list of models and a chat interface that includes a conversation history and a user input field. During the model download phase, a progress bar is displayed. We intentionally avoid adding many screens to keep the app simple and focused on its core functionality. To keep track of which part of the app is being used, we will use a an other state variable called `currentPage`, it will be a string that can be either `modelSelection` or `conversation`. You can add it to the App.tsx file.

```typescript
const [currentPage, setCurrentPage] = useState<
  'modelSelection' | 'conversation'
>('modelSelection'); // Navigation state
```

We will start by working on the model selection screen in the App.tsx file, we will add a list of model formats (you need to do the necessary imports):

```typescript
<SafeAreaView style={styles.container}>
  <ScrollView contentContainerStyle={styles.scrollView}>
    <Text style={styles.title}>Llama Chat</Text>
    {/* Model Selection Section */}
    <View style={styles.card}>
      <Text style={styles.subtitle}>Choose a model format</Text>
      {modelFormats.map(format => (
        <TouchableOpacity
          key={format.label}
          style={[
            styles.button,
            selectedModelFormat === format.label && styles.selectedButton,
          ]}
          onPress={() => handleFormatSelection(format.label)}>
          <Text style={styles.buttonText}>{format.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </ScrollView>
</SafeAreaView>
```

We use SafeAreaView to ensure that the app is displayed correctly on devices with different screen sizes and orientations.

Let's define `handleFormatSelection` in the App.tsx file:

```typescript
const handleFormatSelection = (format: string) => {
  setSelectedModelFormat(format);
  setAvailableGGUFs([]); // Clear any previous list
  fetchAvailableGGUFs(format); /
};
```

We set the store the format in the state and clear the previous list of GGUF files, and then we fetch the new list of GGUF files for the selected format.
The screen should look like this:
![alt text](assets/blog_images/model_selection_start.png)

Next, we will show the list of GGUF files already available for the selected model format, we will add it below the model format selection section.

```typescript
{
  selectedModelFormat && (
    <View>
      <Text style={styles.subtitle}>Select a .gguf file</Text>
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
  );
}
```

We define `handleGGUFSelection` in the App.tsx file as function that will trigger an alert to confirm the download of the selected GGUF file. If the user clicks on `Yes`, the `handleDownloadAndNavigate` function will be called, else the selected GGUF file will be cleared.

```typescript
const handleGGUFSelection = (file: string) => {
  setSelectedGGUF(file);
  Alert.alert(
    'Confirm Download',
    `Do you want to download ${file}?`,
    [
      {
        text: 'No',
        onPress: () => setSelectedGGUF(null),
        style: 'cancel',
      },
      {text: 'Yes', onPress: () => handleDownloadAndNavigate(file)},
    ],
    {cancelable: false},
  );
};
const handleDownloadAndNavigate = async (file: string) => {
  await handleDownloadModel(file);
  setCurrentPage('conversation'); // Navigate to conversation after download
};
```

`handleDownloadAndNavigate` is a simple function that will download the selected GGUF file by calling `handleDownloadModel` and navigate to the conversation screen after the download is complete.

We can add a simple ActivityIndicator to the view to display a loading state when the available GGUF files are being fetched. For that we will need to import `ActivityIndicator` from `react-native` and define `isFetchingGGUF` as a boolean state variable that will be set to true in the start of the `fetchAvailableGGUFs` function and false when the function is finished.

Now we should be able to see the different GGUF files available for each model format when we click on it, and we should see the alert when clicking on a GGUF confirming if we want to download the model.
We can also add the progress bar to the model selection screen, you can do it by adding the `ProgressBar` component from `src/components/ProgressBar.tsx` to the `App.tsx` file and using the `isDownloading` state variable to display it :

```typescript
{
  isDownloading && (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Downloading : </Text>
      <Text style={styles.subtitle2}>{selectedGGUF}</Text>
      <ProgressBar progress={progress} />
    </View>
  );
}
```
The download progress bar will now be positioned at the bottom of the model selection screen. However, this means that users may need to scroll down to view it. To address this, we will modify the display logic so that the model selection screen is only shown when the `currentPage` state is set to 'modelSelection' and there is no ongoing model download.

```typescript
{currentPage === 'modelSelection' && !isDownloading && (
            <View style={styles.card}>
              <Text style={styles.subtitle}>Choose a model format</Text>
...
```
Now that we have the model selection screen, we can start working on the conversation screen with the chat interface. This screen will be displayed when `currentPage` is set to 'conversation'. We will add a conversation history and a user input field to the screen. The conversation history will be displayed in a scrollable view, and the user input field will be displayed at the bottom of the screen out of the scrollable view to stay visible. Each message will be displayed in a different color depending on the role of the message (user or assistant).

We need to add just under the model selection screen: 
```typescript
{currentPage == 'conversation' && !isDownloading && (
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
              {msg.content}
          </Text>
        </View>
      </View>
    ))}
  </View>
)}
```
It's been a long journey, but we're almost done. We can now add the user input field at the bottom of the screen and the send button. As I mentioned before, we will use the `handleSendMessage` function to send the user message to the model and update the conversation state with the model response.
```typescript
{currentPage === 'conversation' && (
  <View style={styles.inputContainer}>
    <TextInput
      style={styles.input}
      placeholder="Type your message..."
      placeholderTextColor="#94A3B8"
      value={userInput}
      onChangeText={setUserInput}
    />
    <View style={styles.buttonRow}>
      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSendMessage}
        disabled={isGenerating}>
        <Text style={styles.buttonText}>
          {isGenerating ? 'Generating...' : 'Send'}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
)}
```
When the user clicks on the send button, the `handleSendMessage` function will be called and the `isGenerating` state will be set to true. The send button will then be disabled and the text will change to 'Generating...'. When the model has finished generating the response, the `isGenerating` state will be set to false and the text will change back to 'Send'.

Congratulations you've just built your first AI chatbot

### **The other Functionnalities**

The app is now fully functional, you can download a model, select a GGUF file, and chat with the model. If you want to add more features, you can add them by following the same pattern as we did for the chat interface. In the other repo, I've added some other features, like on the fly generation, automatic scrolling, the inference speed tracking, the thought process of the model like deepseek-qwen-1.5B, we will not go into details here as it will make the blog too long but you can check the repo for more information.



## **4. Testing the App**

To run and test your app:

1. Start the Metro bundler:

```bash
npm start
```

2. In a new terminal, run the app:

```bash
npm run android  # For Android
# or
npm run ios     # For iOS
```

![alt text](assets/blog_images/app_screenshot.png)

## **5. Key Features**

Our implemented app includes:

- Model selection and download from Hugging Face
- Local model initialization and inference
- Real-time chat interface
- Inference speed tracking
- Progress tracking for downloads
- Clean, intuitive UI

## **6. Performance Tips**

1. **Model Selection:**

   - Choose smaller quantized models (4-bit or 8-bit)
   - Consider model size vs. performance tradeoffs

2. **Memory Management:**

   - Properly release model context when switching models
   - Monitor device memory usage

3. **UI Responsiveness:**
   - Use proper state management
   - Implement loading states
   - Handle errors gracefully

## **7. Conclusion**

You now have a working React Native app that can:

- Download models from Hugging Face
- Run inference locally
- Provide a smooth chat experience
- Track model performance

This implementation serves as a foundation for building more sophisticated AI-powered mobile applications. Remember to consider device capabilities when selecting models and tuning parameters.

Happy coding! 🚀
