import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeatureToolbar } from '../../components/FeatureToolbar';
import { useEditorStore } from '../../store/editorStore';

beforeEach(() => {
  useEditorStore.setState({
    workspaceMode: 'design',
    fusionWorkspace: 'SOLID',
    isSketchActive: false,
    activeTool: 'select',
    activeSketchTool: 'line',
    sketchPhase: 'drawing',
    timeline: [],
  });
});

describe('FeatureToolbar', () => {
  describe('design mode', () => {
    it('renders workspace tabs', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('SOLID')).toBeInTheDocument();
      expect(screen.getByText('SURFACE')).toBeInTheDocument();
      expect(screen.getByText('SHEET METAL')).toBeInTheDocument();
      expect(screen.getByText('MESH')).toBeInTheDocument();
      expect(screen.getByText('PLASTIC')).toBeInTheDocument();
    });

    it('switches fusion workspace on tab click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('SURFACE'));
      expect(useEditorStore.getState().fusionWorkspace).toBe('SURFACE');
    });

    it('renders Create Sketch button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Create Sketch (S)')).toBeInTheDocument();
    });

    it('renders dropdown menu labels', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Modify')).toBeInTheDocument();
      expect(screen.getByText('Assemble')).toBeInTheDocument();
      expect(screen.getByText('Construct')).toBeInTheDocument();
      expect(screen.getByText('Inspect')).toBeInTheDocument();
    });

    it('opens Create dropdown on click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('Create'));
      expect(screen.getByText('Extrude')).toBeInTheDocument();
      expect(screen.getByText('Revolve')).toBeInTheDocument();
      expect(screen.getByText('Sweep')).toBeInTheDocument();
      expect(screen.getByText('Loft')).toBeInTheDocument();
      expect(screen.getByText('Hole')).toBeInTheDocument();
      expect(screen.getByText('Box')).toBeInTheDocument();
      expect(screen.getByText('Cylinder')).toBeInTheDocument();
    });

    it('opens Modify dropdown on click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('Modify'));
      expect(screen.getByText('Fillet')).toBeInTheDocument();
      expect(screen.getByText('Chamfer')).toBeInTheDocument();
      expect(screen.getByText('Shell')).toBeInTheDocument();
      expect(screen.getByText('Split Body')).toBeInTheDocument();
      expect(screen.getByText('Combine')).toBeInTheDocument();
    });

    it('shows keyboard shortcuts in dropdown', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('Create'));
      expect(screen.getByText('E')).toBeInTheDocument(); // Extrude shortcut
      expect(screen.getByText('H')).toBeInTheDocument(); // Hole shortcut
    });

    it('renders quick-access tool buttons', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Extrude (E)')).toBeInTheDocument();
      expect(screen.getByTitle('Fillet (F)')).toBeInTheDocument();
      expect(screen.getByTitle('Hole (H)')).toBeInTheDocument();
      expect(screen.getByTitle('Combine (B)')).toBeInTheDocument();
    });

    it('renders select button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Select (V)')).toBeInTheDocument();
    });

    it('renders measure button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Measure (M)')).toBeInTheDocument();
    });

    it('begins plane selection when Create Sketch is clicked', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByTitle('Create Sketch (S)'));
      const state = useEditorStore.getState();
      expect(state.sketchPhase).toBe('selectPlane');
    });
  });

  describe('sketch mode - plane selection', () => {
    beforeEach(() => {
      useEditorStore.setState({
        isSketchActive: true,
        sketchPhase: 'selectPlane',
      });
    });

    it('shows SELECT PLANE message', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('SKETCH — SELECT PLANE')).toBeInTheDocument();
    });

    it('shows instruction text', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText(/Click a reference plane/)).toBeInTheDocument();
    });

    it('shows Cancel button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('✕ Cancel')).toBeInTheDocument();
    });

    it('cancels sketch on Cancel click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('✕ Cancel'));
      expect(useEditorStore.getState().isSketchActive).toBe(false);
    });
  });

  describe('sketch mode - drawing', () => {
    beforeEach(() => {
      useEditorStore.setState({
        isSketchActive: true,
        sketchPhase: 'drawing',
        activeSketchTool: 'line',
      });
    });

    it('shows SKETCH label', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('SKETCH')).toBeInTheDocument();
    });

    it('renders sketch drawing tools', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Line (L)')).toBeInTheDocument();
      expect(screen.getByTitle('Rectangle (R)')).toBeInTheDocument();
      expect(screen.getByTitle('Circle (C)')).toBeInTheDocument();
      expect(screen.getByTitle('3-Point Arc (A)')).toBeInTheDocument();
    });

    it('renders sketch modify tools', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Trim')).toBeInTheDocument();
      expect(screen.getByTitle('Offset')).toBeInTheDocument();
      expect(screen.getByTitle('Mirror')).toBeInTheDocument();
    });

    it('shows Finish Sketch button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('✓ Finish Sketch')).toBeInTheDocument();
    });

    it('shows Cancel button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('✕ Cancel')).toBeInTheDocument();
    });

    it('finishes sketch on Finish click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('✓ Finish Sketch'));
      expect(useEditorStore.getState().isSketchActive).toBe(false);
    });

    it('cancels sketch on Cancel click', () => {
      render(<FeatureToolbar />);
      fireEvent.click(screen.getByText('✕ Cancel'));
      expect(useEditorStore.getState().isSketchActive).toBe(false);
    });

    it('renders Create and Modify dropdowns in sketch mode', () => {
      render(<FeatureToolbar />);
      // Sketch mode has its own Create/Modify/Constraints dropdowns
      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Modify')).toBeInTheDocument();
      expect(screen.getByText('Constraints')).toBeInTheDocument();
    });

    it('renders Dimension button', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Dimension (D)')).toBeInTheDocument();
    });
  });

  describe('assembly mode', () => {
    beforeEach(() => {
      useEditorStore.setState({
        workspaceMode: 'assembly',
        isSketchActive: false,
      });
    });

    it('shows ASSEMBLE label', () => {
      render(<FeatureToolbar />);
      expect(screen.getByText('ASSEMBLE')).toBeInTheDocument();
    });

    it('renders assembly tools', () => {
      render(<FeatureToolbar />);
      expect(screen.getByTitle('Insert')).toBeInTheDocument();
      expect(screen.getByTitle('Ground')).toBeInTheDocument();
      expect(screen.getByTitle('Joint')).toBeInTheDocument();
      expect(screen.getByTitle('As-Built Joint')).toBeInTheDocument();
      expect(screen.getByTitle('Rigid Group')).toBeInTheDocument();
      expect(screen.getByTitle('Motion Study')).toBeInTheDocument();
    });
  });
});
