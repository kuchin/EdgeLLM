# **Build a React Native App to Chat locally with an LLM: A Step-by-Step Guide**

Did you ever wonder how can you create a mobile app to chat with LLMs locally, and did you try to understand the code in some open source projects but it was too hard, well this is the blog for you ! We will help you build a simple react native app to chat with LLMs donwloaded from the huggingface hub. For that we will use React Native.
React Native makes it easy to create cross-platform mobile apps, and Large Language Models (LLMs) have brought conversational AI into the spotlight. In this guide, we’ll walk through building a simple React Native app that lets users chat with an LLM locally, without the need of an API all on device.

---

## **Why This Tutorial?**
This blog is for anyone who:
- Wants to get started with React Native.
- Is curious about integrating AI into mobile apps.
- Wants to build a conversational app that works on both Android and iOS.

By the end of this guide, you’ll have a working app to chat with your favorite smol hub models.

---

## **1. Setting Up Your Environment**
React Native requires some setup before you can start coding.

### **Tools You Need**
1. **Node.js:** Install from [Node.js downloads](https://nodejs.org/en/download).
2. **react-native-community/cli:** Run the following to install:
```bash
   npm i @react-native-community/cli
```
### **Emulator**
To run your app during development you will need an emulator, if you have a mac, you can have both an android and ios emulator. For the ios emulator, you need to install the xcode editor, go to Xcode -> Open Developer Tools -> Simulator. For android, you need to install javaruntime and android studio, you can follow this tutorial made by expo, it's great : https://docs.expo.dev/workflow/android-studio-emulator/. For pcs, you need to install javaruntime and android studio using the same tuto, and for ios simulators it's not natively supported, there are some options like cloud based simulators, like [LambdaTest](https://www.lambdatest.com/test-on-iphone-simulator) and [BrowserStack](https://www.browserstack.com/test-on-ios-simulator) or some third party emulators that try to mimic iOS behavior but we didn't test them.

## **2. Create the app**

Let's start this project ! first we need to initiate the app using @react-native-community/cli. We just need to run 
```bash
   npx @react-native-community/cli@latest init <ProjectName>
```

the app folder architecture for a new project looks like : ![alt text](assets/blog_images/project_architecture.png)

### **Default Folders**

#### 1. `android/`
- Contains the native Android project files.
- **Purpose**: To build and run the app on Android devices.

#### 2. `ios/`
- Contains the native iOS project files.
- **Purpose**: To build and run the app on iOS devices.

#### 3. `node_modules/`
- **Purpose**: Holds all npm dependencies used in the project.

#### 4. `App.js`
- The main root component of your app.
- **Purpose**: Serves as the entry point to the app's UI and logic, where components and navigation are set up.

#### 5. `index.js`
- Registers the root component (`App`) with the app registry.
- **Purpose**: The entry point for the React Native runtime, linking the app logic with the React Native system.

---

### **Custom Folders**

#### 1. `src/`
- **Purpose**: Contains all application code, organized for scalability.

##### - `components/`
  - Reusable, modular UI components.

##### - `screens/`
  - Components that represent entire screens or pages.

##### - `navigation/`
  - Navigation configurations and stacks for `react-navigation`.

##### - `hooks/`
  - Custom hooks for reusable business logic.

##### - `context/`
  - Global state management using React Context API.

##### - `utils/`
  - Helper functions and utilities.

##### - `assets/`
  - Static resources like images and fonts.

##### - `styles/`
  - Global and shared stylesheets or themes.

##### - `constants/`
  - App-wide constants like API endpoints or environment configs.

---

### **Additional Configuration Files**

#### 1. `tsconfig.json`
- **Purpose**: Configures TypeScript settings.
- Example:
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

#### 2. `babel.config.js`
**Purpose**: Configures Babel for transpiling modern JavaScript/TypeScript.

#### 3. `jest.config.js`
**Purpose**: Configures Jest for testing React Native components and logic.

#### 2. `Gemfile`
**Purpose**: Specifies Ruby gem dependencies for iOS builds.

#### 2. `.watchmanconfig`
**Purpose**: Configures Watchman, a file-watching service used by React Native for hot reloading.

#### 2. `package.json`
**Purpose**: Lists npm dependencies, scripts, and metadata for your project.

#### 2. `metro.config.js`
**Purpose**: Customizes the Metro bundler for the project. The Metro bundler is a JavaScript bundler specifically designed for React Native. It takes your project’s JavaScript and assets, bundles them into a single file (or multiple files for efficient loading), and serves them to the app during development. Metro is optimized for fast incremental builds, supports hot reloading, and handles React Native’s platform-specific files (.ios.js or .android.js). It ensures your app gets the right code and assets.

## **2. How to Debug**

To debug your application you need to have an emulator setup or use your own device. In this blog, we will adopt the former option because it's more practical and easier for development to have the phone screen near the code editor to see changes in real time. You need to open the emulator you are planning to use.
```bash
   npm install
   npm start
```
keep this terminal with the metro bundler open, and open an other terminal, and run the follwing command depending on your emulator : 
```bash
   npm run <ios or androind> 
```
This should launch the app on the emulator, and you can reload it from the metro bundler terminal by pressing r.

To debug the app, you can open Dev Tools by pressing j in the metro bundler terminal and you should have something like this : 

![alt text](assets/blog_images/dev_tools.png)

You can add breakpoints, and run the application from the emulator, the execution will stop at the breakpoint, and you can go from there using the famous step over, step into, and step out arrows

## **3. Code the app**

### Project Structure

Our app will have two main screens:
1. Model Selection: Where users can choose and download LLM models
2. Chat Interface: Where users can interact with the selected model

### Installing Dependencies
Now let's start by creating the logic of the app
We want to be able to load models from the Huggingface hub and run them locally, for that we will need to install some dependencies : llama.rn which is a binding to llama.cpp for react native apps, react-native-fs to manage the phone file system using react native, and axios to send requests to the hub API


```bash
  npm install axios react-native-fs llama.rn
```

### Step 1: Setting Up the Model Selection Screen

First, let's define our state variables and types in App.tsx:

```typescript
type Message = {
  role: 'User' | 'Assistant';
  content: string;
};

const [context, setContext] = useState(null); // Context where the llm will be initiated using llama.rn
const [conversation, setConversation] = useState([
  {role: 'Assistant', content: 'Hi there! How can I help you today?'},
]);
const [selectedModelFormat, setSelectedModelFormat] = useState(''); // Model format will be Llama-3.2-1B-Instruct, or Qwen2-1.5B-Instruct for example 
const [selectedGGUF, setSelectedGGUF] = useState(null);
const [availableGGUFs, setAvailableGGUFs] = useState([]);
```

This code block sets up the essential state variables needed for the chat application using React's useState hook. The Message type defines the structure of chat messages, specifying that each message must have a role (either 'User' or 'Assistant') and content (the actual message text). We then create several state variables: context to store the initialized LLM model, conversation to keep track of the chat history (initialized with a welcome message), selectedModelFormat to store which model the user selects (like Llama or Qwen), selectedGGUF to store the specific model file chosen, and availableGGUFs to store the list of model files that can be downloaded. 

Define the available models:

```typescript
const HF_TO_GGUF = {
  'Llama-3.2-1B-Instruct': 'bartowski/Llama-3.2-1B-Instruct-GGUF',
  'DeepSeek-R1-Distill-Qwen-1.5B': 'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
  'Qwen2-1.5B-Instruct': 'Qwen/Qwen2-0.5B-Instruct-GGUF',
};

const modelFormats = [
  {label: 'Llama-3.2-1B-Instruct'},
  {label: 'Qwen2-1.5B-Instruct'},
  {label: 'DeepSeek-R1-Distill-Qwen-1.5B'},
];
```

We define two important structures for managing the available LLM models in our application. Our HF_TO_GGUF object creates a mapping between user-friendly model names and their corresponding Hugging Face repository paths - for example, when a user selects 'Llama-3.2-1B-Instruct', we'll know to fetch it from 'bartowski/Llama-3.2-1B-Instruct-GGUF' repository. Our modelFormats array defines the list of models that we'll display to users in the selection screen. These variables work together during our model download process: when a user selects a model from our UI (using modelFormats), we use HF_TO_GGUF to determine the correct Hugging Face repository URL to download the model files from. For instance, if a user clicks "Llama-3.2-1B-Instruct" in our UI, we'll look up its repository path in HF_TO_GGUF to construct the full download URL.


### Step 2: Implementing Model Download

Create a function to fetch available GGUF files from Hugging Face:

```typescript
const fetchAvailableGGUFs = async (modelFormat: string) => {
  try {
    const response = await axios.get(
      `https://huggingface.co/api/models/${
        HF_TO_GGUF[modelFormat as keyof typeof HF_TO_GGUF]
      }`,
    );
    const files = response.data.siblings.filter((file: any) =>
      file.rfilename.endsWith('.gguf'),
    );
    setAvailableGGUFs(files.map((file: any) => file.rfilename));
  } catch (error) {
    Alert.alert('Error', 'Failed to fetch .gguf files from Hugging Face API.');
  }
};
```

we're creating a way to fetch and display available GGUF model files from Hugging Face for our selected model format. When a user selects a model format, we make an API call to Hugging Face using the repository path we mapped in our HF_TO_GGUF object. We're specifically looking for files that end with '.gguf' extension, which are our quantized model files. Once we receive the response, we extract just the filenames of these GGUF files and store them in our availableGGUFs state using setAvailableGGUFs. This allows us to show users a list of available model variants they can download.

We then Implement the download functionality and store the downloaded file in the Documents folder of the application :

```typescript
const handleDownloadModel = async () => {
  if (!selectedGGUF) {
    Alert.alert('Error', 'Please select a model file to download.');
    return;
  }

  const downloadUrl = `https://huggingface.co/${
    HF_TO_GGUF[selectedModelFormat as keyof typeof HF_TO_GGUF]
  }/resolve/main/${selectedGGUF}`;
  
  setIsDownloading(true);
  setProgress(0);

  const destPath = `${RNFS.DocumentDirectoryPath}/${selectedGGUF}`;
  
  try {
    const destPath = await downloadModel(
      selectedGGUF,
      downloadUrl,
      progress => setProgress(progress),
    );
    await loadModel(selectedGGUF);
  } catch (error) {
    Alert.alert('Error', `Download failed: ${error.message}`);
  } finally {
    setIsDownloading(false);
  }
};
```
The downloadModel function is defined in src/api, it takes the modelName, the url, and a progress function as a callback that will be called during the donwloading phase. We use RNFS module from react-native-fs to store the model in the Documents folder of the app, and update the progress bar.

We also define a progress bar in the components folder, that's updated each time progress is updated
## Step 3: Loading and Initializing the Model

We then Create a function to load the downloaded model into a Llama context, this was based on the doc of llama.rn [here](https://github.com/mybigday/llama.rn). If the context is already loaded, we release it and set it to null, and we also reset the conversation to its initial state. We then load the model into the context using the initLlama function, and we set the context to the new context.

```typescript
const loadModel = async (modelName: string) => {
  try {
    const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
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
    Alert.alert('Error Loading Model', error.message);
    return false;
  }
};
```

### Step 4: Implementing the Chat Interface

We then create the chat interface, we want to display the conversation history and the user input field, and we want to send the user input to the model and display the model response. 

```typescript
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
    {role: 'User', content: userInput},
  ];
  setConversation(newConversation);
  setUserInput('');
  setIsLoading(true);

  try {
    const stopWords = ['</s>', '<|end|>', 'User:', 'Assistant:', '<|im_end|>', '<|eot_id|>'];
    const result = await context.completion(
      {
        messages: newConversation,
        n_predict: 100,
        stop: stopWords,
      },
      data => console.log('Partial token:', data.token),
    );

    setConversation([
      ...newConversation,
      {role: 'Assistant', content: result.text.trim()},
    ]);
    setTokensPerSecond([...tokensPerSecond, parseFloat(result.timings.predicted_per_second.toFixed(2))]);
  } catch (error) {
    Alert.alert('Error During Inference', error.message);
  } finally {
    setIsLoading(false);
  }
};
```
Each time the user submits an input we update the conversation state, feed it to the model using context.completion, get the model response, and re-update the conversation with it. We also access the timings that are part of the results returned by the model to display the inference speed. 

### Step 5: The UI

The UI is not very complex, we have a model selection screen with a list of models, and a chat interface with a conversation history and a user input field. We also have a progress bar that is displayed during the model download phase. We choose not to define many screens because we want to keep the app simple and focus on the core functionality.

## **4. Test the app**

To test the app, you can just run it on the emulator, and you should have something like this : 

![alt text](assets/blog_images/app_screenshot.png)

## **5. Conclusion**

This blog was a step-by-step guide to building a simple React Native app that allows users to chat with an LLM locally, without the need of an API all on device. We covered the setup of the project, the code of the app, and the testing of the app. We hope this guide was helpful and that it inspires you to build more complex apps using AI and React Native.



add smollm
shoutout to the maintainer of pocketpal
add gguf converting guide
Link to the hub 


















Let me enhance the debugging section to be more comprehensive and clearer.

```
## **Debugging Your React Native App**

Debugging a React Native application requires either an emulator or a physical device. We'll focus on using an emulator since it provides a more streamlined development experience with your code editor and debugging tools side by side.

### **Setting Up for Debugging**

1. Start by ensuring your development environment is ready:
```bash
# Install dependencies
npm install

# Start the Metro bundler
npm start
```

### **Running the App**

In a new terminal, launch the app on your chosen platform:
```bash
# For iOS
npm run ios

# For Android
npm run android
```

### **Debug Tools and Features**

#### **Metro Bundler Commands**
- Press `r` - Reload the app
- Press `d` - Open Developer Menu
- Press `j` - Open Chrome DevTools
- Press `i` - Run on iOS simulator
- Press `a` - Run on Android emulator

#### **Chrome DevTools Debugging**
1. Press `j` in the Metro bundler terminal to launch Chrome DevTools
2. Navigate to the "Sources" tab
3. Find your source files under the `debuggerWorker.js` tree
4. Set breakpoints by clicking on line numbers
5. Use debugging controls:
   - Step Over (F10) - Execute current line
   - Step Into (F11) - Enter function call
   - Step Out (Shift+F11) - Exit current function
   - Continue (F8) - Run until next breakpoint

#### **React Native Debugger (Alternative)**
For a more enhanced debugging experience:
```bash
# Install React Native Debugger (macOS)
brew install --cask react-native-debugger

# For Windows/Linux, download from GitHub releases
```

### **Common Debugging Tips**

1. **Console Logging**
```javascript
console.log('Debug value:', someValue);
console.warn('Warning message');
console.error('Error details');
```

2. **Breakpoint Debugging**
- Add the `debugger` statement in your code
```javascript
function handleSendMessage() {
  debugger; // Execution will pause here
  // Rest of your code
}
```

3. **Network Debugging**
- Monitor API calls in Chrome DevTools Network tab
- Use the Network Inspector in React Native Debugger

### **Troubleshooting Common Issues**

1. **Red Screen Errors**
- Read the error message carefully
- Check the line number and file reference
- Use console.logs to trace the error path

2. **Metro Bundler Issues**
```bash
# Clear Metro bundler cache
npm start -- --reset-cache
```

3. **Build Errors**
```bash
# Clean and rebuild
cd android && ./gradlew clean
cd ios && pod install
```

Remember to disable debugging when building for production as it can impact performance. You can toggle debugging mode from the Developer Menu (shake device or `⌘D` on iOS simulator, `⌘M` on Android emulator).
```

This revised section provides:
- Clearer structure and organization
- More comprehensive debugging options
- Common troubleshooting scenarios
- Practical tips and commands
- Better explanation of debugging tools

Would you like me to expand on any particular aspect of debugging?