"""
DeepTrace — Frame Extractor
Uniformly samples up to max_frames from a video file using OpenCV.
Performance target: ≤30 frames for a 10-second clip.
"""
import cv2
import numpy as np
from typing import Tuple, List


def extract_frames(
    video_path: str,
    max_frames: int = 30
) -> Tuple[List[np.ndarray], float, float]:
    """
    Extract up to max_frames from video_path using uniform sampling.

    Returns:
        frames   – list of BGR numpy arrays
        fps      – frames per second of source video
        duration – video duration in seconds
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return [], 25.0, 0.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps          = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration     = total_frames / fps if fps > 0 else 0.0

    if total_frames <= 0:
        cap.release()
        return [], fps, duration

    # Uniform index sampling
    if total_frames <= max_frames:
        indices = list(range(total_frames))
    else:
        indices = [int(round(i * (total_frames - 1) / (max_frames - 1)))
                   for i in range(max_frames)]

    frames: List[np.ndarray] = []
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret and frame is not None:
            frames.append(frame)

    cap.release()
    return frames, fps, duration
