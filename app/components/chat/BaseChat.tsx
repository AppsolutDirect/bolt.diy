/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import type { JSONValue, Message } from 'ai';
import Cookies from 'js-cookie';
import React, { type RefCallback, useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { getApiKeysFromCookies } from './APIKeyManager';
import styles from './BaseChat.module.scss';
import ChatAlert from './ChatAlert';
import { ChatBox } from './ChatBox';
import GitCloneButton from './GitCloneButton';
import LlmErrorAlert from './LLMApiAlert';
import { Messages } from './Messages.client';
import ProgressCompilation from './ProgressCompilation';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import { Menu } from '~/components/sidebar/Menu.client';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { Workbench } from '~/components/workbench/Workbench.client';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import type { ActionAlert, SupabaseAlert, DeployAlert, LlmErrorAlertType } from '~/types/actions';
import type { ProgressAnnotation } from '~/types/context';
import type { DesignScheme } from '~/types/design-scheme';
import type { ProviderInfo } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  llmErrorAlert?: LlmErrorAlertType;
  clearLlmErrorAlert?: () => void;
  data?: JSONValue[] | undefined;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  append?: (message: Message) => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: (element: ElementInfo | null) => void;
  addToolResult?: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onWebSearchResult?: (result: string) => void;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      llmErrorAlert,
      clearLlmErrorAlert,
      data,
      chatMode,
      setChatMode,
      append,
      designScheme,
      setDesignScheme,
      selectedElement,
      setSelectedElement,
      addToolResult = () => {
        throw new Error('addToolResult not implemented');
      },
      onWebSearchResult,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(true);

    /*
     * Eingabebereich (samt Buttons) bei einem Tippen AUSSERHALB des Containers
     * nach unten aus dem Bild schieben und bei dem nächsten Tippen irgendwo
     * wieder hereinschieben.
     *
     * 'idle'  = sichtbar
     * 'out'   = gleitet gerade nach unten weg
     * 'gone'  = komplett weg
     * 'in'    = gleitet gerade wieder herein
     */
    const inputContainerRef = React.useRef<HTMLDivElement>(null);
    const inputInnerRef = React.useRef<HTMLDivElement>(null);
    const [inputAnim, setInputAnim] = useState<'idle' | 'out' | 'gone' | 'in'>('idle');
    const [inputHeight, setInputHeight] = useState(0);
    const [slideDistance, setSlideDistance] = useState(0);

    /*
     * Android-Bildschirmtastatur: Der Eingabebereich wird um genau die Tastaturhöhe nach oben
     * geschoben und fährt beim Schließen wieder ganz nach unten.
     *
     * Schnellster Weg (Chrome/Android): VirtualKeyboard-API. Der Browser liefert die Tastaturhöhe
     * direkt als CSS-Wert (env(keyboard-inset-height)), ohne JavaScript und ohne Neuberechnung
     * der Seite. Fallback für andere Browser: sichtbare Fläche messen und die Verschiebung
     * direkt am Element setzen (ohne React-Rendering, ohne Übergangsanimation).
     */
    const [hasVirtualKeyboard, setHasVirtualKeyboard] = useState(false);

    useEffect(() => {
      const nav = navigator as Navigator & { virtualKeyboard?: { overlaysContent: boolean } };

      if (nav.virtualKeyboard) {
        nav.virtualKeyboard.overlaysContent = true;
        setHasVirtualKeyboard(true);

        return () => {
          if (nav.virtualKeyboard) {
            nav.virtualKeyboard.overlaysContent = false;
          }
        };
      }

      const viewport = window.visualViewport;

      if (!viewport) {
        return undefined;
      }

      const apply = () => {
        const offset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
        const element = inputContainerRef.current;

        if (element) {
          // kleine Abweichungen (Adressleiste etc.) ignorieren
          element.style.transform = offset > 80 ? `translateY(-${offset}px)` : '';
        }
      };

      // Manche Android-Tastaturen melden ihre Größe verspätet: kurz nachmessen
      const timers: ReturnType<typeof setTimeout>[] = [];
      const applySoon = () => {
        apply();
        [100, 250].forEach((delay) => timers.push(setTimeout(apply, delay)));
      };

      apply();
      viewport.addEventListener('resize', apply);
      viewport.addEventListener('scroll', apply);
      document.addEventListener('focusin', applySoon);
      document.addEventListener('focusout', applySoon);

      return () => {
        timers.forEach(clearTimeout);
        viewport.removeEventListener('resize', apply);
        viewport.removeEventListener('scroll', apply);
        document.removeEventListener('focusin', applySoon);
        document.removeEventListener('focusout', applySoon);
      };
    }, []);
    const inputCollapsed = inputAnim === 'out' || inputAnim === 'gone';

    // Höhe des Eingabebereichs messen (wird für Animation und Platzfreigabe gebraucht)
    useEffect(() => {
      const element = inputInnerRef.current;

      if (!element || typeof ResizeObserver === 'undefined') {
        return undefined;
      }

      const update = () => {
        const height = element.offsetHeight;

        if (height > 0) {
          setInputHeight(height);
        }
      };

      update();

      const observer = new ResizeObserver(update);
      observer.observe(element);

      return () => observer.disconnect();
    }, []);

    // Beim Wechsel zwischen Startseite und Chat immer sichtbar starten
    useEffect(() => {
      setInputAnim('idle');
    }, [chatStarted]);

    useEffect(() => {
      // Auf der Startseite (noch kein Chat) bleibt der Eingabebereich immer sichtbar
      if (!chatStarted) {
        return undefined;
      }

      /*
       * Nur ein einfacher Tipp (kaum Bewegung, kurze Dauer) blendet den Container
       * ein oder aus. Wischen/Scrollen löst nie etwas aus.
       */
      const MAX_MOVE = 10; // Pixel
      const MAX_TAP_DURATION = 500; // Millisekunden

      let tracking = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let startedInsideInput = false;

      const onTouchStart = (event: TouchEvent) => {
        // Mehrfingergesten (Zoomen) ignorieren
        if (event.touches.length !== 1) {
          tracking = false;
          return;
        }

        tracking = true;
        moved = false;
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        startTime = Date.now();
        startedInsideInput = !!inputContainerRef.current?.contains(event.target as Node);
      };

      const onTouchMove = (event: TouchEvent) => {
        if (!tracking) {
          return;
        }

        const touch = event.touches[0];

        if (touch && (Math.abs(touch.clientX - startX) > MAX_MOVE || Math.abs(touch.clientY - startY) > MAX_MOVE)) {
          moved = true;
        }
      };

      const onTouchEnd = () => {
        if (!tracking) {
          return;
        }

        tracking = false;

        // Scrollen/Wischen oder langes Drücken: nichts ein- oder ausblenden
        if (moved || Date.now() - startTime > MAX_TAP_DURATION) {
          return;
        }

        // Strecke bis zum unteren Bildschirmrand, damit der Container komplett herausgleitet
        const rect = inputInnerRef.current?.getBoundingClientRect();

        if (rect && rect.height > 0) {
          setSlideDistance(Math.max(0, window.innerHeight - rect.top) + 16);
        }

        setInputAnim((state) => {
          // ausgeblendet (oder gerade dabei): ein Tipp blendet wieder ein
          if (state === 'out' || state === 'gone') {
            return 'in';
          }

          // sichtbar: Tipp außerhalb des Containers blendet aus
          if (!startedInsideInput) {
            return 'out';
          }

          return state;
        });
      };

      // Der Browser übernimmt die Geste (z.B. Scrollen): abbrechen
      const onTouchCancel = () => {
        tracking = false;
      };

      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
      document.addEventListener('touchcancel', onTouchCancel, { passive: true });

      return () => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchCancel);
      };
    }, [chatStarted]);

    // gemeinsame Animation für Eingabecontainer und Buttons darunter
    const slideAnimation =
      inputAnim === 'out'
        ? 'bolt-input-out 180ms ease-out forwards'
        : inputAnim === 'in'
          ? 'bolt-input-in 180ms ease-out'
          : undefined;
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const expoUrl = useStore(expoUrlAtom);
    const [qrModalOpen, setQrModalOpen] = useState(false);

    useEffect(() => {
      if (expoUrl) {
        setQrModalOpen(true);
      }
    }, [expoUrl]);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);
    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);
        setSelectedElement?.(null);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[16vh] max-w-2xl mx-auto text-center px-4 lg:px-0">
                <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
                  Where ideas begin
                </h1>
                <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
                  Bring ideas to life in seconds or get help on existing projects.
                </p>
              </div>
            )}
            <StickToBottom
              className={classNames('pt-6 px-2 sm:px-6 relative flex-1 min-h-0 flex flex-col', {
                'modern-scrollbar': chatStarted,
              })}
              resize="smooth"
              initial="smooth"
            >
              <StickToBottom.Content className="flex flex-col gap-4 relative ">
                <ClientOnly>
                  {() => {
                    return chatStarted ? (
                      <Messages
                        className="flex flex-col w-full flex-1 max-w-chat pb-4 mx-auto z-1 text-[0.9rem] sm:text-base"
                        messages={messages}
                        isStreaming={isStreaming}
                        append={append}
                        chatMode={chatMode}
                        setChatMode={setChatMode}
                        provider={provider}
                        model={model}
                        addToolResult={addToolResult}
                      />
                    ) : null;
                  }}
                </ClientOnly>
                <ScrollToBottom />
              </StickToBottom.Content>
              <style>{`
                @keyframes bolt-input-out {
                  from { transform: translateY(0); }
                  to { transform: translateY(calc(var(--bolt-input-h) + 1rem)); }
                }
                @keyframes bolt-input-in {
                  from { transform: translateY(calc(var(--bolt-input-h) + 1rem)); }
                  to { transform: translateY(0); }
                }
              `}</style>
              <div
                ref={inputContainerRef}
                className={classNames('mt-auto w-full max-w-chat mx-auto z-prompt', {
                  'sticky bottom-0': chatStarted,
                })}
                style={{
                  ...(chatStarted && inputHeight > 0 ? { height: inputCollapsed ? 0 : inputHeight } : {}),
                  ...(hasVirtualKeyboard ? { transform: 'translateY(calc(-1 * env(keyboard-inset-height, 0px)))' } : {}),
                  transition:
                    chatStarted && inputHeight > 0 && inputAnim !== 'idle' ? 'height 180ms ease-out' : undefined,
                }}
              >
                <div
                  ref={inputInnerRef}
                  className="flex flex-col gap-1 pb-0"
                  style={
                    {
                      '--bolt-input-h': `${slideDistance}px`,
                      animation: slideAnimation,
                      display: inputAnim === 'gone' && chatStarted ? 'none' : undefined,
                      visibility: inputAnim === 'gone' && !chatStarted ? 'hidden' : undefined,
                    } as React.CSSProperties
                  }
                  onAnimationEnd={(event) => {
                    if (event.animationName === 'bolt-input-out') {
                      setInputAnim('gone');
                    } else if (event.animationName === 'bolt-input-in') {
                      setInputAnim('idle');
                    }
                  }}
                >
                {!chatStarted && (
                  <div className="flex flex-col gap-2 pb-1">
                    <div className="bolt-examples-first">
                      <style>{`.bolt-examples-first button:not(:first-of-type) { display: none; }`}</style>
                      {ExamplePrompts((event, messageInput) => {
                        if (isStreaming) {
                          handleStop?.();
                          return;
                        }

                        handleSendMessage?.(event, messageInput);
                      })}
                    </div>
                    <div className="flex w-full gap-1.5">
                      {ImportButtons(importChat)}
                      <GitCloneButton importChat={importChat} />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2 empty:hidden">
                  {deployAlert && (
                    <DeployChatAlert
                      alert={deployAlert}
                      clearAlert={() => clearDeployAlert?.()}
                      postMessage={(message: string | undefined) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {supabaseAlert && (
                    <SupabaseChatAlert
                      alert={supabaseAlert}
                      clearAlert={() => clearSupabaseAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {actionAlert && (
                    <ChatAlert
                      alert={actionAlert}
                      clearAlert={() => clearAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearAlert?.();
                      }}
                    />
                  )}
                  {llmErrorAlert && <LlmErrorAlert alert={llmErrorAlert} clearAlert={() => clearLlmErrorAlert?.()} />}
                </div>
                {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                <ChatBox
                  isModelSettingsCollapsed={isModelSettingsCollapsed}
                  setIsModelSettingsCollapsed={setIsModelSettingsCollapsed}
                  provider={provider}
                  setProvider={setProvider}
                  providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                  model={model}
                  setModel={setModel}
                  modelList={modelList}
                  apiKeys={apiKeys}
                  isModelLoading={isModelLoading}
                  onApiKeysChange={onApiKeysChange}
                  uploadedFiles={uploadedFiles}
                  setUploadedFiles={setUploadedFiles}
                  imageDataList={imageDataList}
                  setImageDataList={setImageDataList}
                  textareaRef={textareaRef}
                  input={input}
                  handleInputChange={handleInputChange}
                  handlePaste={handlePaste}
                  TEXTAREA_MIN_HEIGHT={TEXTAREA_MIN_HEIGHT}
                  TEXTAREA_MAX_HEIGHT={TEXTAREA_MAX_HEIGHT}
                  isStreaming={isStreaming}
                  handleStop={handleStop}
                  handleSendMessage={handleSendMessage}
                  enhancingPrompt={enhancingPrompt}
                  enhancePrompt={enhancePrompt}
                  isListening={isListening}
                  startListening={startListening}
                  stopListening={stopListening}
                  chatStarted={chatStarted}
                  exportChat={exportChat}
                  qrModalOpen={qrModalOpen}
                  setQrModalOpen={setQrModalOpen}
                  handleFileUpload={handleFileUpload}
                  chatMode={chatMode}
                  setChatMode={setChatMode}
                  designScheme={designScheme}
                  setDesignScheme={setDesignScheme}
                  selectedElement={selectedElement}
                  setSelectedElement={setSelectedElement}
                  onWebSearchResult={onWebSearchResult}
                />
                </div>
              </div>
            </StickToBottom>
          </div>
          <ClientOnly>
            {() => (
              <Workbench chatStarted={chatStarted} isStreaming={isStreaming} setSelectedElement={setSelectedElement} />
            )}
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <>
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-bolt-elements-background-depth-1 to-transparent h-20 z-10" />
        <button
          className="sticky z-50 bottom-0 left-0 right-0 text-4xl rounded-lg px-1.5 py-0.5 flex items-center justify-center mx-auto gap-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
          onClick={() => scrollToBottom()}
        >
          Go to last message
          <span className="i-ph:arrow-down animate-bounce" />
        </button>
      </>
    )
  );
}
