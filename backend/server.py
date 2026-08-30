#!/usr/bin/env python3
"""
QQ拼豆施工图生成器 - 后端服务
Flask REST API
"""

import json
import os
import sys
import time
import uuid
import hashlib
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

# Add backend dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from generate_pattern import generate_pattern as gen_pattern
from generate_pattern import auto_size_grid_with_complexity, analyze_image_complexity

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / 'data' / 'outputs'
UPLOAD_DIR = BASE_DIR / 'backend' / 'uploads'
HISTORY_FILE = BASE_DIR / 'data' / 'history.json'

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── History management ──

def load_history():
    if HISTORY_FILE.exists():
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def save_history(history):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


# ── API Routes ──

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '1.0.0'})


@app.route('/api/generate', methods=['POST'])
def generate():
    """Generate perler bead pattern from uploaded image."""
    if 'image' not in request.files:
        return jsonify({'error': '未上传图片'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400

    # Parse params
    grid_size = request.form.get('grid_size', 'auto')
    bg_remove = request.form.get('bg_remove', 'false').lower() == 'true'
    cell_size = int(request.form.get('cell_size', 24))
    max_colors = int(request.form.get('max_colors', 0))

    # Save uploaded file
    ext = os.path.splitext(file.filename)[1] or '.png'
    upload_id = str(uuid.uuid4())[:8]
    upload_path = UPLOAD_DIR / f'{upload_id}{ext}'
    file.save(str(upload_path))

    # Parse grid size
    if grid_size == 'auto':
        from PIL import Image
        img = Image.open(upload_path).convert('RGB')
        w, h = img.size
        complexity = analyze_image_complexity(img)
        grid_w, grid_h = auto_size_grid_with_complexity(w, h, complexity)
    else:
        parts = grid_size.split('x')
        if len(parts) == 2:
            grid_w, grid_h = int(parts[0]), int(parts[1])
        else:
            grid_w = grid_h = int(parts[0])

    # Generate output filename
    output_id = str(uuid.uuid4())[:8]
    output_path = OUTPUT_DIR / f'{output_id}.png'

    try:
        result = gen_pattern(
            image_path=str(upload_path),
            output_path=str(output_path),
            grid_w=grid_w,
            grid_h=grid_h,
            cell_size=cell_size,
            max_colors=max_colors,
            bg_remove=bg_remove,
        )

        history_item = {
            'id': output_id,
            'original_name': file.filename,
            'grid_w': grid_w,
            'grid_h': grid_h,
            'total_beads': result['subject_beads'],
            'bg_beads': result.get('bg_beads', 0),
            'color_count': result['color_count'],
            'usage': result['usage'],
            'colors_detail': result['colors_detail'],
            'bg_removed': bg_remove,
            'created_at': datetime.now().isoformat(),
            'output_file': f'{output_id}.png',
        }
        # Clean up upload
        try:
            os.remove(upload_path)
        except Exception:
            pass

        return jsonify({
            'success': True,
            'data': history_item,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/output/<filename>', methods=['GET'])
def get_output(filename):
    """Serve generated pattern image."""
    filepath = OUTPUT_DIR / filename
    if not filepath.exists():
        return jsonify({'error': '文件不存在'}), 404
    return send_file(str(filepath), mimetype='image/png')


@app.route('/', methods=['GET'])
def index():
    return send_from_directory(BASE_DIR / 'frontend', 'index.html')


@app.route('/<path:filename>', methods=['GET'])
def frontend_assets(filename):
    return send_from_directory(BASE_DIR / 'frontend', filename)


if __name__ == '__main__':
    print('🍉 小瓜的拼豆施工图 - 后端服务启动中...')
    print(f'   📁 输出目录: {OUTPUT_DIR}')
    print(f'   🌐 服务地址: http://localhost:5000')
    app.run(host='0.0.0.0', port=5000, debug=True)
