import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { z } from 'zod';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { resetConnectionsStore } from '@/stores/connectionsStore';
import { GenericConnectorForm, type FieldSpec } from './GenericConnectorForm';

const NODE_ID = 'node-generic-1';

const SCHEMA = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  label: z.string().optional(),
  max: z.number().optional(),
  verbose: z.boolean().optional(),
});

const FIELDS: ReadonlyArray<FieldSpec> = [
  { kind: 'text', key: 'query', label: 'Query', required: true, help: 'The search query.' },
  { kind: 'text', key: 'label', label: 'Label' },
  { kind: 'number', key: 'max', label: 'Max results' },
  { kind: 'checkbox', key: 'verbose', label: 'Verbose', description: 'Log everything' },
];

const renderForm = (config: Record<string, unknown> = {}): void => {
  render(
    <GenericConnectorForm
      nodeId={NODE_ID}
      config={config}
      testId="generic-form"
      provider="google"
      providerLabel="Google"
      schema={SCHEMA}
      fields={FIELDS}
    />,
  );
};

describe('GenericConnectorForm', () => {
  beforeEach(() => {
    resetConnectionsStore();
    useEditorStore.setState({ ...initialEditorState, updateNodeConfig: vi.fn() });
  });

  it('renders field labels in sentence case (no uppercase class)', () => {
    renderForm();
    const label = screen.getByText('Query');
    expect(label.className).not.toContain('uppercase');
  });

  it('shows a required dot for required fields and an info trigger for help', () => {
    renderForm();
    expect(screen.getByTestId('field-label-required-dot')).toBeInTheDocument();
    expect(screen.getByTestId('field-label-help')).toBeInTheDocument();
  });

  it('renders a checkbox field as a ToggleSwitch and toggles the boolean', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });
    renderForm();
    // Optional checkbox fields live inside the collapsed Options section.
    fireEvent.click(screen.getByText(/Options/));
    const sw = screen.getByRole('switch', { name: /Verbose/i });
    expect(sw).toBeInTheDocument();
    fireEvent.click(sw);
    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, { verbose: true });
  });

  it('keeps required fields outside the collapsed Options section', () => {
    renderForm();
    // Required field is visible without expanding.
    expect(screen.getByText('Query')).toBeInTheDocument();
    // Optional fields are hidden until the Options header is clicked.
    expect(screen.queryByText('Label')).toBeNull();
    expect(screen.queryByRole('switch', { name: /Verbose/i })).toBeNull();
  });

  it('reveals optional fields inside the Options section once expanded', () => {
    renderForm();
    fireEvent.click(screen.getByText(/Options/));
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Verbose/i })).toBeInTheDocument();
  });

  it('renders the Options meta with the literal "· defaults" suffix', () => {
    renderForm();
    // 2 optional fields (label, max) + verbose checkbox + mock toggle = 4 options.
    expect(screen.getByText(/· defaults/)).toBeInTheDocument();
    expect(screen.getByText('4 options · defaults')).toBeInTheDocument();
  });

  // A pill (fx/expression mode) in an enum SELECT field must NOT block the form:
  // the resolved value is validated at runtime by the worker, so the client skips
  // validation for any `{{...}}`-holding field. A bare invalid enum literal still
  // surfaces an error (the contrast case below).
  describe('pill in a select field (fx/expression mode)', () => {
    const ENUM_SCHEMA = z.object({
      connectionId: z.string().min(1),
      method: z.enum(['GET', 'POST']),
    });
    const ENUM_FIELDS: ReadonlyArray<FieldSpec> = [
      {
        kind: 'select',
        key: 'method',
        label: 'Method',
        required: true,
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ],
      },
    ];

    const renderEnumForm = (config: Record<string, unknown>): void => {
      render(
        <GenericConnectorForm
          nodeId={NODE_ID}
          config={config}
          testId="enum-form"
          provider="http"
          providerLabel="HTTP"
          schema={ENUM_SCHEMA}
          fields={ENUM_FIELDS}
        />,
      );
    };

    it('does not render an enum error when the select holds a {{pill}}', () => {
      renderEnumForm({ connectionId: 'conn-1', method: '{{ trigger.method }}' });
      expect(screen.queryByTestId('enum-form-method-error')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('still surfaces an error for an invalid non-pill enum literal', () => {
      renderEnumForm({ connectionId: 'conn-1', method: 'FETCH' });
      expect(screen.getByTestId('enum-form-method-error')).toBeInTheDocument();
    });
  });
});
