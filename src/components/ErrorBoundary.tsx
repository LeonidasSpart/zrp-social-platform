"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // You can send this to an error logging service (e.g., Sentry)
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-gray-50 dark:bg-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4 max-w-md">
            We're sorry, an unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2 bg-zrp-red text-white rounded-full font-medium hover:bg-zrp-darkRed transition"
          >
            Try again
          </button>
          <p className="mt-4 text-xs text-gray-400">
            If the problem persists, contact support.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
