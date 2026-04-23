'use client';

/**
 * LAYER: Frontend
 * React error boundary. Wraps any subtree to catch render errors and show
 * a graceful fallback instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   // Custom fallback:
 *   <ErrorBoundary fallback={<p>Something broke.</p>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center min-h-[200px]">
          <AlertTriangle className="size-8 text-destructive" />
          <div>
            <p className="font-semibold text-sm">Something went wrong</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {this.state.error.message}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={this.reset}>
            <RefreshCw className="size-3 mr-1.5" /> Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
