import torch.nn as nn

WIN = 16


class Head(nn.Module):
    """Classifier over the last 16 embeddings (16 x 96) -> probability that the wake word just ended."""

    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Flatten(), nn.Dropout(0.1), nn.Linear(WIN * 96, 96), nn.LayerNorm(96), nn.ReLU(), nn.Dropout(0.4),
            nn.Linear(96, 48), nn.ReLU(), nn.Dropout(0.2), nn.Linear(48, 1), nn.Sigmoid(),
        )

    def forward(self, x):
        return self.net(x)
