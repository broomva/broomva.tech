# #%%
# import os
# import re
# import ntpath

# def clean_filename(filename):
#     # This regex will match the UUIDs and remove them
#     return re.sub(r'[a-f0-9]{32}', '', filename).strip('_')

# def add_navigation_links(content, parent_link, child_link):
#     navigation = ""
#     if parent_link:
#         navigation += f"[← Back to {parent_link}](../{parent_link}.md)\n\n"
#     if child_link:
#         navigation += f"[Go to {child_link}](./{child_link}/{child_link}.md)\n\n"
#     return navigation + content
# #%%
# def process_directory(directory_path, parent_name=None):
#     # List all files and directories in the current directory
#     for item in os.listdir(directory_path):
#         item_path = os.path.join(directory_path, item)
#         if os.path.isdir(item_path):
#             # If the item is a directory, process it recursively
#             child_name = clean_filename(item)
#             process_directory(item_path, parent_name=child_name)
#         elif item.endswith('.md'):
#             # If the item is a markdown file, clean its content
#             with open(item_path, 'r', encoding='utf-8') as file:
#                 content = file.read()

#             # Clean file content from UUIDs
#             cleaned_content = re.sub(r'\([a-f0-9]{32}\)', '()', content)
            
#             # Get the first child link if available
#             child_dirs = [clean_filename(d) for d in os.listdir(directory_path) if os.path.isdir(os.path.join(directory_path, d))]
#             child_link = child_dirs[0] if child_dirs else None
            
#             # Add navigation links
#             navigation_content = add_navigation_links(cleaned_content, parent_name, child_link)
            
#             # Write the cleaned content back to the file
#             with open(item_path, 'w', encoding='utf-8') as file:
#                 file.write(navigation_content)

#             # Rename the file to remove the UUID
#             cleaned_filename = clean_filename(item)
#             os.rename(item_path, os.path.join(directory_path, cleaned_filename))
# #%%
# # Assuming the script is run at the root where the 'FOLDERS' are located
# root_path = '/Users/broomva/GitHub/broomva.tech/book/blog'  # Change this to your path
# process_directory(root_path)

# # %%

#%%

import glob
import os
import re


def clean_filename(filename):
    # Remove the hash from the filename
    cleaned_filename = re.sub(r'\s[0-9a-f]{32}\s', ' ', filename)
    return cleaned_filename

def add_navigation_links(filepath):
    # Add navigation links to the file content
    with open(filepath, 'r') as file:
        lines = file.readlines()

    # Add navigation links at the beginning and end of the file
    lines.insert(0, '[Go to previous page](./previous_page.md)\n')
    lines.append('\n[Go to next page](./next_page.md)')

    with open(filepath, 'w') as file:
        file.writelines(lines)

def clean_notion_export(directory):
    # Iterate over all markdown files in the directory
    for filepath in glob.iglob(directory + '**/*.md', recursive=True):
        # Clean the filename
        dirpath, filename = os.path.split(filepath)
        cleaned_filename = clean_filename(filename)
        cleaned_filepath = os.path.join(dirpath, cleaned_filename)
        os.rename(filepath, cleaned_filepath)

        # Add navigation links
        add_navigation_links(cleaned_filepath)

# Call the function on your directory
clean_notion_export('/Users/broomva/GitHub/broomva.tech/book/blog')
# %%
