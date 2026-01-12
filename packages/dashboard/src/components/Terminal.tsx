import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

import { useSessionOutput } from '../hooks/use-session-output';

export interface TerminalHandle {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
}

interface TerminalProps {
  sessionId: string;
  className?: string;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  ({ sessionId, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const lastWrittenIndexRef = useRef(0);

    // Subscribe to session output from the store
    const { output } = useSessionOutput(sessionId);

    // Safe fit function that checks dimensions and catches errors
    // Also notifies the backend to resize the PTY
    const safeFit = useCallback(() => {
      const container = containerRef.current;
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;

      if (!container || !fitAddon) return;

      // Check that container has non-zero dimensions before fitting
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;

      try {
        fitAddon.fit();

        // Notify backend of new dimensions so PTY can be resized
        if (terminal && sessionId) {
          const { cols, rows } = terminal;
          fetch(`/api/sessions/${sessionId}/resize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cols, rows }),
          }).catch(() => {
            // Silently ignore resize errors - session may have ended
          });
        }
      } catch {
        // Silently ignore fit errors - container may not be ready yet
      }
    }, [sessionId]);

    // Expose terminal methods to parent
    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        terminalRef.current?.write(data);
      },
      writeln: (data: string) => {
        terminalRef.current?.writeln(data);
      },
      clear: () => {
        terminalRef.current?.clear();
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      // Create terminal instance
      const terminal = new XTerm({
        theme: {
          background: '#1e293b', // slate-800
          foreground: '#e2e8f0', // slate-200
          cursor: '#94a3b8', // slate-400
          cursorAccent: '#1e293b',
          selectionBackground: '#475569', // slate-600
          selectionForeground: '#f8fafc', // slate-50
          black: '#1e293b',
          red: '#f87171', // red-400
          green: '#4ade80', // green-400
          yellow: '#facc15', // yellow-400
          blue: '#60a5fa', // blue-400
          magenta: '#c084fc', // purple-400
          cyan: '#22d3ee', // cyan-400
          white: '#f1f5f9', // slate-100
          brightBlack: '#64748b', // slate-500
          brightRed: '#fca5a5', // red-300
          brightGreen: '#86efac', // green-300
          brightYellow: '#fde047', // yellow-300
          brightBlue: '#93c5fd', // blue-300
          brightMagenta: '#d8b4fe', // purple-300
          brightCyan: '#67e8f9', // cyan-300
          brightWhite: '#ffffff',
        },
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        cursorBlink: false,
        disableStdin: true,
        convertEol: true,
        scrollback: 5000,
      });

      // Initialize addons
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Open terminal in container
      terminal.open(containerRef.current);

      // Store references first so safeFit can use them
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Fit terminal to container (deferred to ensure layout is complete)
      window.requestAnimationFrame(() => {
        safeFit();
      });

      // Handle window resize
      const handleResize = () => {
        safeFit();
      };
      window.addEventListener('resize', handleResize);

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    }, [safeFit]);

    // Re-fit when container might have changed size
    useEffect(() => {
      const observer = new ResizeObserver(() => {
        safeFit();
      });

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => {
        observer.disconnect();
      };
    }, [safeFit]);

    // Write new output lines when output array grows
    useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;

      // Get new lines since last written index
      const newLines = output.slice(lastWrittenIndexRef.current);

      // Write each new chunk to the terminal
      // Output may contain embedded newlines, use write() to let terminal handle line endings
      for (const chunk of newLines) {
        terminal.write(chunk);
      }

      // Update the last written index
      lastWrittenIndexRef.current = output.length;
    }, [output]);

    return (
      <div
        ref={containerRef}
        className={`h-full w-full overflow-hidden rounded ${className ?? ''}`}
      />
    );
  }
);

Terminal.displayName = 'Terminal';
