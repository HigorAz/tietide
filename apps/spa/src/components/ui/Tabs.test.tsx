import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const renderTabs = (defaultValue = 'one') =>
  render(
    <Tabs defaultValue={defaultValue}>
      <TabsList aria-label="Sample tabs">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
      <TabsContent value="one">Panel one</TabsContent>
      <TabsContent value="two">Panel two</TabsContent>
      <TabsContent value="three">Panel three</TabsContent>
    </Tabs>,
  );

describe('Tabs', () => {
  describe('rendering', () => {
    it('should render triggers with role="tab" and the active panel with role="tabpanel"', () => {
      renderTabs();
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      expect(tabs[0]).toHaveAccessibleName('One');
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel one');
    });

    it('should mark the default tab as selected and others as not selected', () => {
      renderTabs('two');
      const tabs = screen.getAllByRole('tab');
      expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
    });
  });

  describe('interaction', () => {
    it('should switch active tab and visible panel when a trigger is clicked', async () => {
      const user = userEvent.setup();
      renderTabs();
      const [tabOne, tabTwo] = screen.getAllByRole('tab');

      expect(tabOne).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel one');

      await user.click(tabTwo);

      expect(tabTwo).toHaveAttribute('aria-selected', 'true');
      expect(tabOne).toHaveAttribute('aria-selected', 'false');
      expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel two');
    });

    it('should move focus across tabs with arrow keys (keyboard navigation via Radix)', async () => {
      const user = userEvent.setup();
      renderTabs();
      const [tabOne, tabTwo, tabThree] = screen.getAllByRole('tab');

      tabOne.focus();
      expect(tabOne).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(tabTwo).toHaveFocus();

      await user.keyboard('{ArrowRight}');
      expect(tabThree).toHaveFocus();
    });
  });
});
