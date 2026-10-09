import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { chatStore } from '~/lib/stores/chat';
import { sidebarOpenStore } from '~/lib/stores/sidebarMenu';
import { classNames } from '~/utils/classNames';

export function Header() {
  const chat = useStore(chatStore);
  const menuOpen = useStore(sidebarOpenStore);

  return (
    <header
      className={classNames('flex items-center gap-2 px-3 sm:px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-bolt-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center z-logo text-bolt-elements-textPrimary">
        <a href="/" className="text-2xl font-semibold text-accent flex items-center">
          {/* <span className="i-bolt:logo-text?mask w-[46px] inline-block" /> */}
          <img src="/logo-light-styled.png" alt="logo" className="w-[90px] inline-block dark:hidden" />
          <img src="/logo-dark-styled.png" alt="logo" className="w-[90px] inline-block hidden dark:block" />
        </a>
      </div>
      {chat.started ? ( // ChatDescription und HeaderActionButtons nur anzeigen, wenn der Chat gestartet ist.
        <>
          <span className="flex-1 min-w-0 px-2 sm:px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="shrink-0">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {/* Menü-Button: rechts oben (32x32 px) */}
      <button
        type="button"
        aria-label="Menü öffnen"
        aria-expanded={menuOpen}
        onClick={() => sidebarOpenStore.set(!sidebarOpenStore.get())}
        className="z-logo shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive active:bg-bolt-elements-item-backgroundActive transition-colors"
      >
        <div className="i-ph:list text-xl" />
      </button>
    </header>
  );
}
