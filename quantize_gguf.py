import tempfile
from huggingface_hub import HfApi
import signal
from typing import List, Tuple, Optional
from dataclasses import dataclass
import subprocess
from pathlib import Path
from huggingface_hub import (
    HfApi, 
    create_repo,
    CommitOperationAdd
)
import argparse
import shutil
@dataclass
class QuantizationConfig:
    """Configuration for model quantization settings"""
    standard_formats = [
        "Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", 
        "Q4_K_S", "Q4_K_M", "Q5_0", "Q5_K_S", "Q5_K_M",
        "Q6_K", "Q8_0"
    ]
    imatrix_formats = [
        "IQ3_M", "IQ3_XXS", "Q4_K_M", "Q4_K_S", 
        "IQ4_NL", "IQ4_XS", "Q5_K_M", "Q5_K_S"
    ]

class ModelQuantizer:
    def __init__(self, llama_cpp_path: str):
        """
        Initialize the ModelQuantizer with the path to llama.cpp directory
        
        Args:
            llama_cpp_path: Path to the llama.cpp directory containing the necessary binaries
        """
        self.llama_cpp_path = Path(llama_cpp_path)
        self.conversion_script = self.llama_cpp_path / "convert_hf_to_gguf.py"
        self.quantize_binary = self.llama_cpp_path / "build" / "bin" / "llama-quantize"
        self.imatrix_binary = self.llama_cpp_path / "build" / "bin" / "llama-imatrix"
        
        # Validate required files exist
        if not all(p.exists() for p in [self.conversion_script, self.quantize_binary, self.imatrix_binary]):
            raise FileNotFoundError("Required llama.cpp files not found. Please ensure the path is correct.")

    def _convert_to_fp16(self, model_path: str, output_path: str) -> None:
        """Convert the model to FP16 format"""
        result = subprocess.run([
            "python", str(self.conversion_script),
            model_path,
            "--outtype", "f16",
            "--outfile", output_path
        ], capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"Error converting to fp16: {result.stderr}")

    def _generate_importance_matrix(self, model_path: str, train_data_path: str, output_path: str) -> None:
        """Generate importance matrix for the model"""
        process = subprocess.Popen([
            str(self.imatrix_binary),
            "-m", model_path,
            "-f", train_data_path,
            "-ngl", "99",
            "--output-frequency", "10",
            "-o", output_path
        ])

        try:
            process.wait(timeout=240)
        except subprocess.TimeoutExpired:
            process.send_signal(signal.SIGINT)
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()

        if process.returncode != 0:
            raise Exception("Failed to generate importance matrix")

    def _quantize_model(self, 
                       input_path: str, 
                       output_path: str, 
                       quant_type: str, 
                       imatrix_path: Optional[str] = None) -> None:
        """Quantize the model with specified parameters"""
        cmd = [str(self.quantize_binary)]
        
        if imatrix_path:
            cmd.extend(["--imatrix", imatrix_path])
        
        cmd.extend([input_path, output_path, quant_type])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"Error quantizing model: {result.stderr}")

    def quantize_all_formats(self, 
                           model_path: str, 
                           output_dir: str, 
                           train_data_path: Optional[str] = None) -> List[Tuple[str, str]]:
        """
        Quantize a model into all available GGUF formats
        
        Args:
            model_path: Path to the input model (HuggingFace format)
            output_dir: Directory to save quantized models
            train_data_path: Optional path to training data for imatrix quantization
        
        Returns:
            List of tuples containing (quantization_type, output_path)
        """
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        model_name = Path(model_path).name
        
        quantized_models = []
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            
            # Convert to FP16 first
            fp16_path = tmp_path / f"{model_name}-fp16.gguf"
            self._convert_to_fp16(model_path, str(fp16_path))
            
            imatrix_path = None
            if train_data_path:
                imatrix_path = tmp_path / "imatrix.dat"
                self._generate_importance_matrix(
                    str(fp16_path),
                    train_data_path,
                    str(imatrix_path)
                )
            
            for quant_type in QuantizationConfig.standard_formats:
                output_path = output_dir / f"{model_name}-{quant_type}.gguf"
                self._quantize_model(str(fp16_path), str(output_path), quant_type)
                quantized_models.append((quant_type, str(output_path)))
            
            if imatrix_path:
                for quant_type in QuantizationConfig.imatrix_formats:
                    output_path = output_dir / f"{model_name}-{quant_type}_imat.gguf"
                    self._quantize_model(
                        str(fp16_path),
                        str(output_path),
                        quant_type,
                        str(imatrix_path)
                    )
                    quantized_models.append((f"{quant_type}_IMAT", str(output_path)))
        
        return quantized_models

def download_hf_model(model_id: str, output_dir: str, token: Optional[str] = None) -> str:
    """
    Download a model from HuggingFace Hub
    
    Args:
        model_id: HuggingFace model ID
        output_dir: Directory to save the model
        token: Optional HuggingFace token for private models
    
    Returns:
        Path to the downloaded model
    """
    api = HfApi(token=token)
    
    pattern = (
        "*.safetensors"
        if any(
            file.path.endswith(".safetensors")
            for file in api.list_repo_tree(repo_id=model_id, recursive=True)
        )
        else "*.bin"
    )
    local_dir = Path(output_dir) / model_id.split('/')[-1]
    api.snapshot_download(
        repo_id=model_id,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
        allow_patterns=["*.md", "*.json", "*.model", pattern]
    )
    return str(local_dir)

def upload_models(   quantized_models: List[Tuple[str, str]], 
                     target_repo: str,
                     original_model: str,
                     hf_token: str,
                     private: bool = False) -> str:
        """
        Upload quantized models to HuggingFace Hub
        
        Args:
            quantized_models: List of (format, path) tuples
            target_repo: Target repository name
            original_model: Original model ID for reference
            private: Whether to create private repository
            
        Returns:
            Repository URL
        """
        print(f"Uploading models to {target_repo}...")
        
        api = HfApi(token=hf_token)

        repo_url = create_repo(target_repo, private=private, token=hf_token, exist_ok=True)
        
        readme = f"""
# {target_repo}
GGUF quantized versions of [{original_model}](https://huggingface.co/{original_model})

## Available Formats:
{chr(10).join(f'- `{format}`: {Path(path).name}' for format, path in quantized_models)}

## Usage with llama.cpp:
```bash
# CLI:
llama-cli --hf-repo {target_repo} --hf-file MODEL_FILE -p "Your prompt"

# Server:
llama-server --hf-repo {target_repo} --hf-file MODEL_FILE -c 2048
```
"""
        operations = [CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=readme.encode())]
        operations.extend(
            CommitOperationAdd(path_in_repo=Path(path).name, path_or_fileobj=path)
            for _, path in quantized_models
        )
        
        api.create_commit(
            repo_id=target_repo,
            operations=operations,
            commit_message="Upload quantized models"
        )
        
        return repo_url

def parse_arguments():
    """
    Parse command line arguments
    Returns:
        argparse.Namespace: Parsed command-line arguments
    """
    parser = argparse.ArgumentParser(description='Model Quantization Script')
    
    parser.add_argument('--llama-cpp-path', 
                       type=str,
                       required=True,
                       help='Path to llama.cpp directory')
                       
    parser.add_argument('--model-id',
                       type=str,
                       required=True,
                       help='Model ID from Hugging Face')
                       
    parser.add_argument('--target-repo',
                       type=str,
                       required=True,
                       help='Target repository for the quantized model')
                       
    parser.add_argument('--output-dir',
                       type=str,
                       default='./quantized_models',
                       help='Output directory for quantized models (default: ./quantized_models)')
    
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_arguments()
    LLAMA_CPP_PATH = args.llama_cpp_path
    MODEL_ID = args.model_id
    TARGET_REPO = args.target_repo
    OUTPUT_DIR = args.output_dir
    HF_TOKEN = "" # TODO: Add your HuggingFace token here to access gated models and upload to your own repo
    
    try:
        # Initialize 
        quantizer = ModelQuantizer(LLAMA_CPP_PATH)
        
        print(f"Downloading model {MODEL_ID}...")
        model_path = download_hf_model(MODEL_ID, "./downloads", HF_TOKEN)
        
        train_data_path = "./llama.cpp/groups_merged.txt"  # Update this path
        
        print("Starting quantization process...")
        quantized_models = quantizer.quantize_all_formats(
            model_path,
            OUTPUT_DIR,
            train_data_path
        )
        
        print("\nQuantization completed! Generated models:")
        for quant_type, path in quantized_models:
            print(f"- {quant_type}: {path}")

        # quantized_models = [("Q2_K", "./quantized_models/Minitron-4B-Base-Q2_K.gguf"), ("Q3_K_S", "./quantized_models/Minitron-4B-Base-Q3_K_S.gguf"), ("Q3_K_M", "./quantized_models/Minitron-4B-Base-Q3_K_M.gguf"), ("Q3_K_L", "./quantized_models/Minitron-4B-Base-Q3_K_L.gguf"), ("Q4_0", "./quantized_models/Minitron-4B-Base-Q4_0.gguf"), ("Q4_K_S", "./quantized_models/Minitron-4B-Base-Q4_K_S.gguf"), ("Q4_K_M", "./quantized_models/Minitron-4B-Base-Q4_K_M.gguf"), ("Q5_0", "./quantized_models/Minitron-4B-Base-Q5_0.gguf"), ("Q5_K_S", "./quantized_models/Minitron-4B-Base-Q5_K_S.gguf"), ("Q5_K_M", "./quantized_models/Minitron-4B-Base-Q5_K_M.gguf"), ("Q6_K", "./quantized_models/Minitron-4B-Base-Q6_K.gguf"), ("Q8_0", "./quantized_models/Minitron-4B-Base-Q8_0.gguf")]
        # quantized_models.append(("IQ3_M", "./quantized_models/Minitron-4B-Base-IQ3_M_imat.gguf"))
        # quantized_models.append(("IQ3_XXS", "./quantized_models/Minitron-4B-Base-IQ3_XXS_imat.gguf"))
        # quantized_models.append(("IQ4_NL", "./quantized_models/Minitron-4B-Base-IQ4_NL_imat.gguf"))
        # quantized_models.append(("Q4_K_M", "./quantized_models/Minitron-4B-Base-Q4_K_M_imat.gguf"))
        # quantized_models.append(("Q4_K_S", "./quantized_models/Minitron-4B-Base-Q4_K_S_imat.gguf"))
        # quantized_models.append(("IQ4_XS", "./quantized_models/Minitron-4B-Base-IQ4_XS_imat.gguf"))
        # quantized_models.append(("Q5_K_M", "./quantized_models/Minitron-4B-Base-Q5_K_M_imat.gguf"))
        # quantized_models.append(("Q5_K_S", "./quantized_models/Minitron-4B-Base-Q5_K_S_imat.gguf"))
        
        
        upload_models(quantized_models, TARGET_REPO, MODEL_ID, HF_TOKEN)
    except Exception as e:
        print(f"Error during quantization: {str(e)}")
    finally:
        if 'model_path' in locals():
            shutil.rmtree(Path(model_path).parent, ignore_errors=True)
