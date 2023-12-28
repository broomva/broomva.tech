import os
import re
import shutil
import urllib.parse


def remove_uuid(name):
    # Regular expression to match the specific UUID pattern
    uuid_regex = r'[0-9a-f]{32}'
    # Find UUIDs in the name
    match = re.search(uuid_regex, name)
    uuid = match.group(0) if match else None
    # Remove UUIDs from the name
    new_name = re.sub(uuid_regex, '', name).strip()
    # Remove any trailing spaces before the file extension
    new_name = re.sub(r'\s+\.', '.', new_name)
    return new_name, uuid

def rename_files_and_folders(root_path):
    mapping = {}
    removed_uuids = []

    for path, dirs, files in os.walk(root_path, topdown=False):
        # Process files
        for name in files:
            old_file_path = os.path.join(path, name)
            new_name, uuid = remove_uuid(name)
            new_file_path = os.path.join(path, new_name)
            shutil.move(old_file_path, new_file_path)
            mapping[old_file_path] = new_file_path
            if uuid:
                removed_uuids.append(uuid)

        # Process directories
        for name in dirs:
            old_dir_path = os.path.join(path, name)
            new_name, uuid = remove_uuid(name)
            new_dir_path = os.path.join(path, new_name)
            shutil.move(old_dir_path, new_dir_path)
            mapping[old_dir_path] = new_dir_path
            if uuid:
                removed_uuids.append(uuid)

    return mapping, removed_uuids



# Use the function
root_directory = "blog"  # Replace with your directory path
mapping, removed_uuids = rename_files_and_folders(root_directory)


#%%


def update_file_content(file_path, uuids):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    for uuid in uuids:
        if uuid:
            # Encode UUID and replace it in the content
            encoded_uuid = urllib.parse.quote(uuid).replace('%', '%25')
            content = re.sub(rf'{encoded_uuid}', '', content)

    with open(file_path, 'w', encoding='utf-8') as file:
        file.write(content)


# Update file contents
for file_path in mapping.values():
    if os.path.isfile(file_path) and file_path.endswith('.md'):
        update_file_content(file_path, removed_uuids)