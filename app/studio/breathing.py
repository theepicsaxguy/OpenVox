"""
Text breathing processor — adds natural pauses and prosody to TTS text.

Since pocket-tts doesn't support SSML, we use strategic punctuation
to create the illusion of breathing and natural speech patterns.
"""

import re

from app.logging_config import get_logger

logger = get_logger('studio.breathing')


class BreathingProcessor:
    """
    Processor that adds natural breathing pauses to text.

    Uses punctuation strategically since pocket-tts doesn't support SSML.
    """

    # Pause intensity levels
    LEVELS = {
        'none': 0,  # No breathing
        'light': 1,  # Minimal pauses
        'normal': 2,  # Standard breathing
        'heavy': 3,  # Dramatic pauses
    }

    def __init__(self, intensity: str = 'normal'):
        """
        Initialize breathing processor.

        Args:
            intensity: 'none', 'light', 'normal', or 'heavy'
        """
        self.intensity = intensity if intensity in self.LEVELS else 'normal'
        self.level = self.LEVELS[self.intensity]

    def process(self, text: str) -> str:
        """
        Add breathing pauses to text.

        Args:
            text: Input text to process

        Returns:
            Text with natural pause indicators added
        """
        if self.level == 0:
            return text

        # Process paragraph by paragraph
        paragraphs = text.split('\n\n')
        processed = [self._process_paragraph(p) for p in paragraphs]

        return '\n\n'.join(processed)

    def _process_paragraph(self, text: str) -> str:
        """Process a single paragraph."""
        if not text.strip():
            return text

        # Add pauses at sentence boundaries
        text = self._add_sentence_pauses(text)

        # Add pauses at clause boundaries (commas, conjunctions)
        if self.level >= 2:
            text = self._add_clause_pauses(text)

        # Add emphasis pauses for dramatic effect
        if self.level >= 3:
            text = self._add_emphasis_pauses(text)

        return text

    def _add_sentence_pauses(self, text: str) -> str:
        """
        Add pauses after sentence-ending punctuation.

        Sentence boundaries get the longest pauses.
        """
        # Define pause markers by intensity
        if self.level == 1:
            # Light: Just a brief comma pause
            pause = ','
        elif self.level == 2:
            # Normal: Comma + space for breathing room
            pause = ','
        else:
            # Heavy: Ellipsis for dramatic effect
            pause = '...'

        # Pattern: sentence end followed by space and capital letter
        # We want to add a pause after the period/exclamation/question
        # but before the next sentence

        # First, add longer pause after terminal punctuation
        text = re.sub(r'([.!?])(\s+)(?=[A-Z])', lambda m: f'{m.group(1)}{pause}{m.group(2)}', text)

        return text

    def _add_clause_pauses(self, text: str) -> str:
        """
        Add subtle pauses at clause boundaries.

        This creates more natural rhythm within sentences.
        """
        # Add pause before coordinating conjunctions in long sentences
        conjunctions = r'\b(and|but|or|so|yet|for|nor)\b'

        # Only add if there's no existing comma nearby
        text = re.sub(rf'(?<!,\s)(?<!...\s)\s+({conjunctions})\s+', r', \1 ', text)

        # Add pause after introductory phrases
        intro_patterns = [
            r'^(Well[,.]?\s+)',
            r'^(So[,.]?\s+)',
            r'^(Now[,.]?\s+)',
            r'^(However[,.]?\s+)',
            r'^(Therefore[,.]?\s+)',
            r'^(Finally[,.]?\s+)',
            r'^(First[,.]?\s+)',
            r'^(Second[,.]?\s+)',
            r'^(Then[,.]?\s+)',
        ]

        for pattern in intro_patterns:
            text = re.sub(
                pattern, lambda m: f'{m.group(1).rstrip(". ")}... ', text, flags=re.IGNORECASE
            )

        return text

    def _add_emphasis_pauses(self, text: str) -> str:
        """
        Add dramatic pauses for emphasis.

        This creates a more theatrical, deliberate speaking style.
        """
        # Add pause before parenthetical asides
        text = re.sub(r'\s*(\([^)]+\))', r'... \1', text)

        # Add pause after em-dashes
        text = re.sub(r'—\s*', '—... ', text)

        # Add pause at colons (introducing lists or explanations)
        text = re.sub(r':\s*', ':... ', text)

        # Add pause for dramatic words
        dramatic_words = r'\b(suddenly|finally|amazingly|unfortunately|fortunately|interestingly)\b'
        text = re.sub(rf'({dramatic_words})\s+', r'\1... ', text, flags=re.IGNORECASE)

        return text


def add_breathing(text: str, intensity: str = 'normal') -> str:
    """
    Convenience function to add breathing to text.

    Args:
        text: Input text
        intensity: 'none', 'light', 'normal', or 'heavy'

    Returns:
        Text with breathing pauses added
    """
    processor = BreathingProcessor(intensity)
    return processor.process(text)


def process_chunks_with_breathing(chunks: list[dict], intensity: str = 'normal') -> list[dict]:
    """
    Apply breathing to a list of text chunks.

    Args:
        chunks: List of chunk dicts with 'text' key
        intensity: Breathing intensity level

    Returns:
        Chunks with breathing applied to text
    """
    processor = BreathingProcessor(intensity)

    processed = []
    for chunk in chunks:
        new_chunk = chunk.copy()
        new_chunk['text'] = processor.process(chunk['text'])
        processed.append(new_chunk)

    return processed
