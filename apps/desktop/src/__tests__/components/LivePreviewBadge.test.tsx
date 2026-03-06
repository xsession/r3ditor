import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { LivePreviewBadge } from '../../components/LivePreviewBadge';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    featureDialog: { open: false, featureType: null, params: {}, editing: false },
  });
});

describe('LivePreviewBadge', () => {
  it('renders nothing when dialog is closed', () => {
    const { container } = render(<LivePreviewBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when featureType is null', () => {
    useEditorStore.setState({
      featureDialog: { open: true, featureType: null, params: {}, editing: false },
    });
    const { container } = render(<LivePreviewBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('renders badge when feature dialog is open', () => {
    useEditorStore.setState({
      featureDialog: { open: true, featureType: 'extrude', params: {}, editing: false },
    });
    const { container } = render(<LivePreviewBadge />);
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toContain('Live Preview');
    expect(container.textContent).toContain('extrude');
  });

  it('shows correct feature type', () => {
    useEditorStore.setState({
      featureDialog: { open: true, featureType: 'fillet', params: {}, editing: false },
    });
    const { container } = render(<LivePreviewBadge />);
    expect(container.textContent).toContain('fillet');
  });

  it('has animated pulse indicator', () => {
    useEditorStore.setState({
      featureDialog: { open: true, featureType: 'extrude', params: {}, editing: false },
    });
    const { container } = render(<LivePreviewBadge />);
    const pulse = container.querySelector('.animate-pulse');
    expect(pulse).not.toBeNull();
  });
});
