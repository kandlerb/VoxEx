# VoxEx Start Menu Visual Testing Checklist

This checklist provides a systematic approach to manually testing all UI components
and interactions in the VoxEx Python start menu system.

## Prerequisites

- [ ] Game launches without errors
- [ ] Start menu is displayed on launch
- [ ] No console errors or warnings

## Main Menu Tests

### Layout and Appearance
- [ ] Title "VoxEx" is centered and visible
- [ ] Subtitle "The Python Voxel Explorer" is visible
- [ ] "Create New World" button is prominently displayed
- [ ] Saved worlds list is visible (or "No saved worlds" message)
- [ ] Settings button is accessible
- [ ] Footer hint text is visible

### Seed Input
- [ ] Seed input field is visible
- [ ] Can click to focus the input
- [ ] Can type numbers into the input
- [ ] Backspace deletes characters
- [ ] "Random" button generates new seed
- [ ] Seed value is preserved when navigating away and back

### Saved Worlds List
- [ ] World cards show name, seed, date
- [ ] Clicking a card selects it (visual highlight)
- [ ] Only one card can be selected at a time
- [ ] "Play Selected World" enables when card selected
- [ ] Delete button (X) shows on each card
- [ ] Gear/manage button (*) shows on each card
- [ ] List scrolls if more worlds than fit

## Create World Panel Tests

### Navigation
- [ ] Clicking "Create New World" opens Create panel
- [ ] "Back" button returns to main menu
- [ ] Panel content is scrollable if needed

### World Configuration
- [ ] World Name input accepts text
- [ ] Seed input works (same as main menu)
- [ ] "Random" button works for seed

### Presets
- [ ] All preset buttons visible (Default, Amplified, Flat, Archipelago, Superflat, Caves+)
- [ ] Clicking preset updates slider values
- [ ] Selected preset shows highlight
- [ ] Changing any slider deselects preset

### Biome Selection
- [ ] All biomes shown as checkboxes
- [ ] Can toggle biomes on/off
- [ ] Cannot uncheck all biomes (at least one required)

### Structure Toggles
- [ ] Trees checkbox toggles
- [ ] Caves checkbox toggles
- [ ] Cave density slider shows/hides based on caves checkbox

### Terrain Sliders
- [ ] Tree Density slider works (0-200%)
- [ ] Terrain Amplitude slider works (25-200%)
- [ ] Sea Level slider works (40-80)
- [ ] Current values displayed next to sliders

### Advanced Options
- [ ] Section is collapsible
- [ ] Click header toggles expand/collapse
- [ ] Arrow indicator changes direction
- [ ] All advanced sliders work when expanded
- [ ] Spawn X/Z inputs accept numbers

### Start Game
- [ ] "Start Game" button is prominent
- [ ] Clicking starts world generation
- [ ] Settings are applied to generated world

## World Management Modal Tests

### Modal Behavior
- [ ] Click gear icon (*) on world card opens modal
- [ ] Modal appears centered with backdrop
- [ ] X button closes modal
- [ ] Clicking backdrop closes modal
- [ ] Escape key closes modal

### Rename Section
- [ ] Current name pre-filled in input
- [ ] Can edit name
- [ ] Rename button works
- [ ] Success message shows
- [ ] World list updates with new name
- [ ] Empty name shows error
- [ ] Duplicate name shows error

### Duplicate Section
- [ ] Default name is "[original] (copy)"
- [ ] Can edit copy name
- [ ] Copy button creates duplicate
- [ ] New world appears in list
- [ ] Duplicate name shows error

### Storage Info
- [ ] Progress bar shows cache usage
- [ ] Chunk count is displayed
- [ ] Cache size in MB is displayed
- [ ] Colors change at thresholds (warning at 75%, danger at 90%)

### Export/Import
- [ ] Export button works
- [ ] Export creates .voxex file
- [ ] Success message shows export path
- [ ] Import button works
- [ ] Can select .voxex file
- [ ] Imported world appears in list

### Clear Cache
- [ ] Button is in "danger zone" styling (red)
- [ ] Clicking shows confirmation dialog
- [ ] Cancel closes dialog without action
- [ ] Confirm clears cache
- [ ] Chunk count updates to 0
- [ ] World metadata preserved

## Settings Panel Tests

### Navigation
- [ ] Settings button opens panel
- [ ] Panel has semi-transparent backdrop
- [ ] Back button closes panel
- [ ] Escape closes panel

### Category Sidebar
- [ ] All categories visible (Performance, Graphics, Gameplay, World, Audio, Accessibility)
- [ ] Clicking category switches content
- [ ] Current category shows highlight

### Profiles
- [ ] All profile buttons visible (Performance, Balanced, Quality, Ultra)
- [ ] Clicking profile updates settings
- [ ] Selected profile shows highlight
- [ ] Changing any setting deselects profile

### Search
- [ ] Search input is visible
- [ ] Typing filters visible settings
- [ ] Results show across all categories
- [ ] Clearing search returns to normal view

### Settings Controls
- [ ] Sliders drag smoothly
- [ ] Slider values update in real-time
- [ ] Value labels update as slider moves
- [ ] Checkboxes toggle on click
- [ ] Dropdowns expand on click
- [ ] Dropdown selection works

### Category Content (spot check a few)
- [ ] Performance > Render Distance slider works
- [ ] Graphics > Ambient Occlusion checkbox works
- [ ] Graphics > Shadow Quality dropdown works
- [ ] Gameplay > Mouse Sensitivity slider works
- [ ] Gameplay > FOV slider works
- [ ] World > Time of Day slider works
- [ ] Audio > Master Volume slider works

### Time Presets (World category)
- [ ] Dawn/Sunrise/Morning/Noon buttons visible
- [ ] Afternoon/Sunset/Dusk/Night buttons visible
- [ ] Clicking preset updates time slider
- [ ] Current time preset shows highlight

### Persistence
- [ ] Change settings, close panel, reopen - settings preserved
- [ ] Close game, reopen - settings preserved
- [ ] Settings file exists at expected location

## Keyboard Navigation

### Text Inputs
- [ ] Tab moves between inputs (if implemented)
- [ ] Home/End move cursor to start/end
- [ ] Left/Right arrows move cursor
- [ ] Backspace deletes before cursor
- [ ] Delete removes after cursor

### Modal Dialogs
- [ ] Escape closes modal
- [ ] Enter confirms (where applicable)

### General
- [ ] Escape from Create panel returns to main menu
- [ ] Escape from Settings returns to previous screen

## Error Handling

- [ ] Invalid seed input handled gracefully
- [ ] Missing save file handled (doesn't crash)
- [ ] Corrupted save file handled
- [ ] Invalid export file handled

## Performance Observations

- [ ] UI is responsive (no lag on interactions)
- [ ] Scrolling is smooth
- [ ] Slider dragging is smooth
- [ ] No visible flickering

## Notes

Record any issues or observations here:

```
Issue #1:
Description:
Steps to reproduce:
Expected behavior:
Actual behavior:

Issue #2:
...
```
