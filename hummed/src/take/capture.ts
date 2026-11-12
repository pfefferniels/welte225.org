// A take as it is recorded: the microphone's sound and the taps on the keyboard, both in the time
// of the audio context that plays the roll, so that they lie where they were heard.

/** What a recording holds, in the audio context's time. */
export interface Capture {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  /** The context time at which the first sample was taken. */
  readonly startedAt: number;
  /** The context time of the sound that was being heard at each tap. */
  readonly taps: readonly number[];
}

/** The worklet that hands the microphone's blocks over, each with the frame it began at. */
const PROCESSOR = `
class TakeCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage({ frame: currentFrame, samples: channel.slice() });
    return true;
  }
}
registerProcessor('take-capture', TakeCapture);
`;

interface Block {
  readonly frame: number;
  readonly samples: Float32Array;
}

export class Recorder {
  readonly #context: AudioContext;
  #node: AudioWorkletNode | null = null;
  #stream: MediaStream | null = null;
  #blocks: Block[] | null = null;
  #taps: number[] = [];

  constructor(context: AudioContext) {
    this.#context = context;
  }

  /** Ask for the microphone (once), as it is: no echo cancelling, no levelling, no noise gate. */
  async open(): Promise<void> {
    if (this.#node) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }));
    try {
      await this.#context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(this.#context, 'take-capture', { numberOfOutputs: 1 });
    node.port.onmessage = (event: MessageEvent<Block>) => {
      this.#blocks?.push(event.data);
    };
    // the worklet runs only while it leads somewhere: into a gain of nothing
    const silence = this.#context.createGain();
    silence.gain.value = 0;
    this.#context
      .createMediaStreamSource(stream)
      .connect(node)
      .connect(silence)
      .connect(this.#context.destination);
    this.#stream = stream;
    this.#node = node;
  }

  /** How long the microphone's sound takes to reach the context, as far as the browser says. */
  get inputLatency(): number {
    const settings = this.#stream?.getAudioTracks().at(0)?.getSettings() as { latency?: number } | undefined;
    return settings?.latency ?? 0;
  }

  get recording(): boolean {
    return this.#blocks !== null;
  }

  start(): void {
    this.#blocks = [];
    this.#taps = [];
  }

  /** A key pressed while recording: the context time of what was being heard just then. */
  tap(event: KeyboardEvent): void {
    if (!this.#blocks) return;
    const stamp = this.#context.getOutputTimestamp();
    const heard =
      stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0
        ? stamp.contextTime + (event.timeStamp - stamp.performanceTime) / 1000
        : this.#context.currentTime - this.#context.outputLatency;
    this.#taps.push(heard);
  }

  stop(): Capture {
    const blocks = this.#blocks ?? [];
    this.#blocks = null;
    const sampleRate = this.#context.sampleRate;
    const first = blocks.at(0)?.frame ?? 0;
    const last = blocks.at(-1);
    const samples = new Float32Array(last ? last.frame - first + last.samples.length : 0);
    // each block where its frame says: a block that was dropped leaves silence, not a shift
    for (const block of blocks) samples.set(block.samples, block.frame - first);
    return { samples, sampleRate, startedAt: first / sampleRate, taps: this.#taps };
  }
}
