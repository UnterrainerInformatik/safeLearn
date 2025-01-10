# Obsidian Extensions
Here you can find the technical intricacies of the Obsidian-specific language extension.

[back](README.md) to the main page.
## Globally Unique File Names
Obsidian uses quick-links like so:
```markdown
# The next line will insert a link to a file.
[[md-file-name-without-extension]]

# The next line will insert an image.
![[image-file-name-with-extension]]
```
In order to be able to do that, you are not allowed to have two files with the exact same file-name within a vault. Even if they are located in different directories.
Same goes for images and other assets.
If you have two files, for example, named `test`, then you'll have to add the complete path in links to any of the two `test` files.

So plan your file-names carefully.
You'll be rewarded with a much faster and smoother editing-experience.
## Callouts
Contrary to GitHub or standard MD, Obsidian supports [callouts](https://help.obsidian.md/Editing+and+formatting/Callouts), which are basically colorfully rendered boxes with headings and content (cards, one might say).
Those look great, especially when dealing with long text-flow or when interspersing text with info-points or homework-reminders.

Examples:
```markdown
# A note.
> [!note]
> content
```
![](md/assets/Pasted%20image%2020240315082827.png)

```markdown
# A Warning with 'BOO!' in the heading, instead of the default 'Warning'.
>[!warning] BOO!
>content
```
![](md/assets/Pasted%20image%2020240315082849.png)

```markdown
# A collapsable callout
>[!tip]-
>content
```
![](md/assets/Pasted%20image%2020240315082907.png)

```markdown
# A collapsable callout with 'some long text' as heading.
>[!quote]- some long text
>content
```
![](md/assets/Pasted%20image%2020240315083209.png)

You get the idea.
You can see all the variations [here](https://help.obsidian.md/Editing+and+formatting/Callouts).

They all work with one exception:
![](md/assets/Pasted%20image%2020240315082944.png)
## Image Sizing
The renderer will never touch the image's size, until it won't fit the display. If that occurs, it will just resize it proportionally to fit it.

To display images at a special size, you have the following options.
Those work on normal image-links, like the standard DM ones and the shortcut-links `Obsidian` provides.

```markdown
# Display in 200x200 pixels (x + 'x' + y)
![some alt-text|200x200](assets/my-img.png)
# And as short-link
![[my-img.png|200x200]]

# Display in 200 pixels widths, sized proportionally
![some alt-text|120](assets/my-img.png)
# And as short-link
![[my-img.png|120]]
```
